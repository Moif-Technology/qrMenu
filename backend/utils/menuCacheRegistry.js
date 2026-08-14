// backend/utils/menuCacheRegistry.js
//
// One place to invalidate every cache that serves menu visibility.
//
// The problem this solves: qrMenuCache (qrMenu.controller) and packageCache
// (package.controller) both serve rows out of dbo.QrProductMaster, but each
// controller only ever flushed its own. Hiding a package through the qr-menu
// endpoint left package:headers:* serving the hidden package for up to 300s,
// and adding a package item left qr-menu-items:* stale for up to 180s.
//
// A registry rather than cross-imports: package.controller and qrMenu.controller
// would otherwise have to import each other, which is a cycle.
//
// menuCache (menu.controller) is deliberately NOT registered. It reads
// dbo.ProductMaster, not QrProductMaster, so it is not on the QR visibility
// path -- registering it would evict the 10-minute image mapping on every
// visibility toggle for no correctness benefit.

const caches = new Map();

/**
 * Register a NodeCache instance under a stable name. Re-registering the same
 * name replaces it, so hot reload does not accumulate stale handles.
 */
export function registerMenuCache(name, cache) {
  caches.set(name, cache);
}

/**
 * Flush every registered cache. Call from any handler that changes what a
 * diner can see: assignment, visibility, package membership, package details.
 */
export function invalidateMenuCaches(reason = "unspecified") {
  const names = [];
  for (const [name, cache] of caches) {
    cache.flushAll();
    names.push(name);
  }
  console.log(`[CACHE] Invalidated [${names.join(", ")}] (${reason})`);
}
