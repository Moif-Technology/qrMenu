// Guards the rule that a batch-scoped payout action is resolved server-side and
// never rewrites the batch number it was scoped by. The bug this replaces:
// the UI fetched a batch's payments with pageSize=500, the list endpoint capped
// at 200, and a 250-payment batch settled 200 rows while reporting success.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const calls = [];
const stubType = (n) => n;
stubType.BigInt = "BigInt";

mock.module("../utils/payoutDb.js", {
  namedExports: {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/COUNT\(\*\) AS cnt/.test(sql)) return [{ cnt: 250, amount: 40812.26 }];
      if (/NEXT VALUE FOR/.test(sql)) return [{ n: 777 }];
      return [];
    },
    mssql: {
      BigInt: "BigInt", Int: "Int", Money: "Money", Date: "Date",
      DateTime2: "DateTime2",
      VarChar: (n) => `VarChar(${n})`,
      NVarChar: (n) => `NVarChar(${n})`
    }
  }
});

const { default: router } = await import("../routes/payout/payouts.routes.js");

function handlerFor(path) {
  const layer = router.stack.find((l) => l.route?.path === path);
  assert.ok(layer, `route ${path} not found`);
  return layer.route.stack.at(-1).handle;
}

function fakeRes() {
  return {
    code: 200,
    body: null,
    status(c) { this.code = c; return this; },
    json(o) { this.body = o; return this; }
  };
}

async function run(path, body) {
  calls.length = 0;
  const res = fakeRes();
  await handlerFor(path)({ body, query: {}, user: { username: "tester", role: "superadmin" } }, res);
  return res;
}

test("batch-scoped transfer-all settles the whole batch and keeps its number", async () => {
  const res = await run("/transfer-all", { batch: [10082026], transferRef: "CHQ-1" });
  assert.equal(res.code, 200);
  assert.equal(res.body.ok, true);

  const write = calls.find((c) => /UPDATE ps/.test(c.sql));
  assert.ok(write, "expected a set-based UPDATE");

  // Scoped by batch, not by an id list - this is what makes truncation impossible.
  assert.match(write.sql, /ps\.BatchNo IN \(@scopeBatch0\)/);
  assert.doesNotMatch(write.sql, /PaymentID IN/);

  // The batch number is the statement number; a settlement must not renumber it.
  assert.doesNotMatch(write.sql, /BatchNo = @batchNo/);
  assert.equal(calls.some((c) => /NEXT VALUE FOR/.test(c.sql)), false, "must not mint a batch number");

  // Already-settled rows are final.
  assert.match(write.sql, /ps\.Status <> 'TRANSFERRED'/);
});

test("unscoped transfer-all still mints and stamps a batch number", async () => {
  await run("/transfer-all", { shopId: 3, transferRef: "CHQ-2" });
  assert.equal(calls.some((c) => /NEXT VALUE FOR/.test(c.sql)), true);
  const write = calls.find((c) => /UPDATE ps/.test(c.sql));
  assert.match(write.sql, /BatchNo = @batchNo/);
});

test("batch-scoped reschedule is one statement and renumbers to the payout date", async () => {
  const res = await run("/bulk-status", {
    batch: [10082026],
    status: "SCHEDULED",
    scheduledDate: "2026-09-04"
  });
  assert.equal(res.code, 200);
  // 4 Sep 2026 -> 4092026 (leading zero lost to the bigint column, by design).
  assert.equal(res.body.batchNo, 4092026);

  const writes = calls.filter((c) => /UPDATE dbo\.PayoutStatus/.test(c.sql));
  assert.equal(writes.length, 1, "a whole-batch move must not loop per payment");
  assert.match(writes[0].sql, /BatchNo IN \(@batch0\)/);
  assert.match(writes[0].sql, /BatchNo = @targetBatchNo/);
  assert.match(writes[0].sql, /Status <> 'TRANSFERRED'/);
});

test("bulk-status still rejects an empty target", async () => {
  const res = await run("/bulk-status", { status: "PROCESSING" });
  assert.equal(res.code, 400);
});
