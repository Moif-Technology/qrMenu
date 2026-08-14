// backend/routes/authCoverage.test.js
// Run with: node --test
//
// The qr-menu and package routers were mounted in index.js with no auth
// middleware at all, so every write was reachable without a token: deleting a
// product, deleting a whole group, or POSTing a new package price. requireAdmin
// existed and worked; it was simply never applied here.
//
// A one-time manual curl proves it is fixed today. These assertions keep it
// fixed when someone adds the next POST route, which is the actual failure mode:
// backend/routes/package.routes.js used to mark its write routes admin-only with
// nothing but a code comment.
//
// No server, no database, no network. Reads the Express router stack directly.

import { test } from "node:test";
import assert from "node:assert/strict";

import qrMenuRoutes from "./qrMenu.routes.js";
import packageRoutes from "./package.routes.js";
import { adminOnlyForWrites } from "../middleware/adminAuth.middleware.js";

const routers = [
  ["qrMenu.routes.js", qrMenuRoutes],
  ["package.routes.js", packageRoutes],
];

/** Middleware layers are the ones with no .route attached. */
const guardLayers = (router) =>
  router.stack.filter((l) => !l.route && l.handle?.name === "adminOnlyForWrites");

/** Index of the first layer that actually defines a route. */
const firstRouteIndex = (router) => router.stack.findIndex((l) => l.route);

for (const [name, router] of routers) {
  test(`${name} mounts the write guard`, () => {
    assert.equal(
      guardLayers(router).length,
      1,
      `${name} must mount adminOnlyForWrites exactly once`
    );
  });

  test(`${name} mounts the guard before any route`, () => {
    // router.use() only protects routes registered after it. Mounting the guard
    // below the route definitions would silently protect nothing.
    const guardIndex = router.stack.findIndex(
      (l) => !l.route && l.handle?.name === "adminOnlyForWrites"
    );
    const routeIndex = firstRouteIndex(router);
    assert.ok(routeIndex !== -1, `${name} should define at least one route`);
    assert.ok(
      guardIndex < routeIndex,
      `${name}: guard is at stack index ${guardIndex} but the first route is at ` +
        `${routeIndex}. Routes registered before router.use() are unprotected.`
    );
  });

  test(`${name} still exposes its GET routes`, () => {
    // The diner QR app reads /api/packages/headers, /contents and /details with
    // no admin session. If this ever goes to zero the customer menu is broken.
    const gets = router.stack.filter((l) => l.route?.methods?.get);
    assert.ok(gets.length > 0, `${name} should keep at least one public GET route`);
  });
}

// --- the guard's own behaviour -------------------------------------------

/** Minimal res double: records the status and whether json() was called. */
function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

test("GET passes through without a token", () => {
  const res = fakeRes();
  let nexted = false;
  adminOnlyForWrites({ method: "GET", headers: {} }, res, () => {
    nexted = true;
  });
  assert.equal(nexted, true, "diner GET traffic must not require an admin token");
  assert.equal(res.statusCode, null);
});

for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
  test(`${method} without a token is rejected with 401`, () => {
    const res = fakeRes();
    let nexted = false;
    adminOnlyForWrites({ method, headers: {} }, res, () => {
      nexted = true;
    });
    assert.equal(nexted, false, `${method} must not reach the handler unauthenticated`);
    assert.equal(res.statusCode, 401);
  });
}

test("a malformed Authorization header is rejected, not passed through", () => {
  const res = fakeRes();
  let nexted = false;
  adminOnlyForWrites(
    { method: "POST", headers: { authorization: "Bearer not-a-real-jwt" } },
    res,
    () => {
      nexted = true;
    }
  );
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 401);
});
