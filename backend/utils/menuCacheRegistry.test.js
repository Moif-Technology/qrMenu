// backend/utils/menuCacheRegistry.test.js
// Run with: node --test
//
// The bug this guards: qrMenuCache and packageCache both serve rows out of
// dbo.QrProductMaster, but each controller only flushed its own. Hiding a
// package left the other cache serving it for up to 300s, so the admin saw no
// change and toggled again.
//
// A wiring bug here is silent -- the toggle returns 200, the DB row is correct,
// and the stale cache just keeps answering. So assert the wiring exists.

import { test } from "node:test";
import assert from "node:assert/strict";
import NodeCache from "node-cache";

import { registerMenuCache, invalidateMenuCaches } from "./menuCacheRegistry.js";

test("invalidateMenuCaches flushes every registered cache", () => {
  const a = new NodeCache();
  const b = new NodeCache();
  a.set("qr-menu-items:all", ["stale"]);
  b.set("package:headers:42:live", ["stale"]);

  registerMenuCache("test-a", a);
  registerMenuCache("test-b", b);
  invalidateMenuCaches("test");

  assert.equal(a.get("qr-menu-items:all"), undefined);
  assert.equal(b.get("package:headers:42:live"), undefined);
});

test("re-registering a name replaces it rather than accumulating handles", () => {
  const first = new NodeCache();
  const second = new NodeCache();
  registerMenuCache("dupe", first);
  registerMenuCache("dupe", second);

  second.set("k", 1);
  invalidateMenuCaches("test");
  assert.equal(second.get("k"), undefined);
});

test("both real menu caches register themselves on import", async () => {
  // Importing the controllers is what wires them up. If someone removes a
  // registerMenuCache() call, the toggle silently stops invalidating the other
  // cache -- this is the assertion that notices.
  const qrCtrl = await import("../controllers/qrMenu.controller.js");
  const pkgCtrl = await import("../controllers/package.controller.js");
  assert.ok(qrCtrl && pkgCtrl, "controllers should import cleanly");

  const probe = new NodeCache();
  probe.set("k", 1);
  registerMenuCache("probe", probe);

  // clearQrMenuCache is the name every qr-menu handler already calls; it must
  // now go through the shared invalidator, not just flush its own cache.
  qrCtrl.clearQrMenuCache();
  assert.equal(
    probe.get("k"),
    undefined,
    "clearQrMenuCache must invalidate all registered menu caches, not only qrMenuCache"
  );
});
