// src/lib/smartImageLookup.js
// High-accuracy, free image lookup for menu items.
// Order: Wikidata→Commons (P18) > Openverse (scored) > Wikipedia PageImages.
// No API keys. Includes caching via memory + localStorage.

const memCache = new Map();
const LS_KEY_PREFIX = "menu_img2:";

function getLS(key) {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function setLS(key, val) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, val); } catch {}
}

const FOOD_QIDS = new Set([
  "Q2095",    // food
  "Q746549",  // dish
  "Q40050",   // beverage
  "Q8495",    // pizza
  "Q28803",   // sandwich
  "Q182015",  // salad
  "Q746835",  // snack
  "Q177",     // tea
  "Q339",     // coffee
  "Q179415",  // curry
  "Q849711",  // biryani
]);

const TAGS_BY_CATEGORY = [
  { rx: /(drink|beverage|juice|shake|smoothie|soda|mocktail|coffee|tea)/i, tags: ["drink","beverage","glass"] },
  { rx: /(dessert|ice ?cream|sweet|pudding|cake|pastry)/i,                 tags: ["dessert","sweet","plate"] },
  { rx: /(pizza)/i,                                                        tags: ["pizza","slice","italian","cheese"] },
  { rx: /(burger)/i,                                                       tags: ["burger","bun","fast food"] },
  { rx: /(wrap|shawarma|roll)/i,                                           tags: ["wrap","shawarma","flatbread"] },
  { rx: /(biryani|rice)/i,                                                 tags: ["biryani","rice","indian"] },
  { rx: /(noodle|chowmein|ramen|udon|soba)/i,                              tags: ["noodles","asian"] },
  { rx: /(sandwich)/i,                                                     tags: ["sandwich","bread"] },
  { rx: /(salad)/i,                                                        tags: ["salad","greens"] },
  { rx: /(grill|tandoori|kebab|kebab)/i,                                   tags: ["grilled","kebab","skewer"] },
  { rx: /(soup)/i,                                                         tags: ["soup","bowl"] },
];

function normalizedName(s) {
  if (!s) return "";
  return s
    .replace(/\b(combo|special|family|meal|deal|set|large|medium|small|spicy|hot|cold|iced|fresh)\b/gi, "")
    .replace(/\b(with|and|&|w\/)\b/gi, " ")
    .replace(/\b(\d+(\.\d+)?\s?(ml|l|g|kg|pcs?|piece|pack))\b/gi, "")
    .replace(/[()[\],#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickTags(item) {
  const hay = [item?.category, item?.name, item?.desc, item?.subtitle].filter(Boolean).join(" ");
  for (const rule of TAGS_BY_CATEGORY) {
    if (rule.rx.test(hay)) return rule.tags;
  }
  // default bias for food
  return ["food","dish","plate"];
}

function buildQueries(item) {
  const base = normalizedName(item?.name);
  const tags = pickTags(item);
  const extra = (item?.category || item?.group || item?.cuisine || "").toString().toLowerCase();
  const cuisineHint = extra ? [extra] : [];

  const q1 = [base, ...cuisineHint, ...tags].join(" ").trim();
  const q2 = [base, ...tags].join(" ").trim();
  const q3 = base;
  return [q1, q2, q3].filter(Boolean);
}

// ---------- Wikidata / Commons (P18) ----------
async function wikidataSearch(query) {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&type=item&limit=5&format=json&origin=*`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("wikidata search failed");
  return r.json();
}
async function wikidataGet(idsCSV) {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${idsCSV}&props=claims|labels&format=json&origin=*`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("wikidata get failed");
  return r.json();
}
function extractP18(entity) {
  const p18 = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  return typeof p18 === "string" ? p18 : null;
}
function hasFoodishP31(entity) {
  const p31 = entity?.claims?.P31 || [];
  return p31.some((c) => {
    const qid = c?.mainsnak?.datavalue?.value?.id;
    return qid && FOOD_QIDS.has(qid);
  });
}
function commonsURLFromFile(file) {
  // File:My_Image.jpg → https://commons.wikimedia.org/wiki/Special:FilePath/File:My_Image.jpg?width=800
  const fname = file.startsWith("File:") ? file : `File:${file}`;
  const src = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fname)}?width=800`;
  const page = `https://commons.wikimedia.org/wiki/${encodeURIComponent(fname)}`;
  return { url: src, page };
}
async function fromWikidata(item) {
  const queries = buildQueries(item);
  for (const q of queries) {
    try {
      const data = await wikidataSearch(q);
      const ids = (data?.search || []).map((x) => x.id).slice(0, 5);
      if (!ids.length) continue;
      const details = await wikidataGet(ids.join("|"));
      const entities = details?.entities || {};
      // Prefer entities whose label/title contains the base name and are food-ish
      const base = normalizedName(item?.name).toLowerCase();
      const ranked = Object.values(entities)
        .map((e) => {
          const label = (e?.labels?.en?.value || "").toLowerCase();
          const score =
            (label.includes(base) ? 3 : 0) +
            (hasFoodishP31(e) ? 5 : 0);
          return { e, score, label };
        })
        .sort((a, b) => b.score - a.score);

      for (const cand of ranked) {
        if (cand.score <= 0) continue;
        const file = extractP18(cand.e);
        if (file) {
          const { url, page } = commonsURLFromFile(file);
          return {
            url,
            credit: `Wikimedia Commons — ${cand.label || item?.name}`,
            source: page,
            provider: "Wikidata/Commons",
            confidence: 0.95,
          };
        }
      }
    } catch {
      // continue to next query
    }
  }
  return null;
}

// ---------- Openverse (no key) ----------
async function fromOpenverse(query) {
  const url = `https://api.openverse.org/v1/images?q=${encodeURIComponent(query)}&page_size=6`;
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error("Openverse fetch failed");
  const data = await r.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  return results;
}
function scoreOpenverse(hit, baseWords, foodTags) {
  const title = (hit?.title || "").toLowerCase();
  const rawTags = (hit?.tags || []).map(t => (t?.name || "").toLowerCase());
  let s = 0;
  for (const w of baseWords) if (w && title.includes(w)) s += 1;
  for (const t of foodTags) if (rawTags.includes(t)) s += 1.5;
  if (/wikimedia|flickr/.test((hit?.provider || "").toLowerCase())) s += 0.5;
  return s;
}
async function tryOpenverse(item) {
  const queries = buildQueries(item);
  const baseWords = normalizedName(item?.name).toLowerCase().split(/\s+/).filter(Boolean);
  const foodTags = pickTags(item).map(x => x.toLowerCase());
  for (const q of queries) {
    try {
      const hits = await fromOpenverse(q);
      if (!hits.length) continue;
      hits.sort((a, b) => scoreOpenverse(b, baseWords, foodTags) - scoreOpenverse(a, baseWords, foodTags));
      const best = hits.find(x => x?.thumbnail || x?.url) || hits[0];
      if (!best) continue;
      return {
        url: best.thumbnail || best.url,
        credit: best.attribution || `${best.creator || "Unknown"} — ${best.license?.toUpperCase() || ""}`,
        source: best.foreign_landing_url || best.url,
        provider: "Openverse",
        confidence: 0.75,
      };
    } catch {
      // try next query
    }
  }
  return null;
}

// ---------- Wikipedia PageImages ----------
async function fromWikipedia(query) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&prop=pageimages&piprop=thumbnail&pithumbsize=800&format=json&origin=*`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Wikipedia fetch failed");
  const data = await r.json();
  const pages = data?.query?.pages;
  if (!pages) return null;
  const first = Object.values(pages).find(p => p?.thumbnail?.source);
  if (!first) return null;
  return {
    url: first.thumbnail.source,
    credit: "Image via Wikipedia (PageImages)",
    source: `https://en.wikipedia.org/?curid=${first.pageid}`,
    provider: "Wikipedia",
    confidence: 0.6,
  };
}
async function tryWikipedia(item) {
  const queries = buildQueries(item);
  for (const q of queries) {
    try {
      const res = await fromWikipedia(q);
      if (res) return res;
    } catch {}
  }
  return null;
}

// ---------- Public API ----------
export async function smartLookupImageForItem(item) {
  const key = LS_KEY_PREFIX + JSON.stringify({
    n: normalizedName(item?.name),
    c: (item?.category || "").toLowerCase(),
    d: (item?.desc || "").slice(0, 60).toLowerCase(),
  });

  if (memCache.has(key)) return memCache.get(key);
  const ls = getLS(key);
  if (ls) {
    try { const parsed = JSON.parse(ls); memCache.set(key, parsed); return parsed; } catch {}
  }

  // 1) Wikidata/Commons
  let found = await fromWikidata(item);
  if (!found) {
    // 2) Openverse
    found = await tryOpenverse(item);
  }
  if (!found) {
    // 3) Wikipedia PageImages
    found = await tryWikipedia(item);
  }

  if (found?.url) {
    memCache.set(key, found);
    setLS(key, JSON.stringify(found));
    return found;
  }
  return null;
}
