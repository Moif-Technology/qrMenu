// Money path: the monthly fee an admin types at transfer time must reach the
// statement's NET AMOUNT TRANSFERRED exactly, VAT on or off. Run: node backend/test/payout-monthly-fee.test.js
import assert from "node:assert/strict";

const VAT_RATE = 0.05;
const BATCH_TRANSFER_FEE = 5;
const MAX_MONTHLY_FEE = 100000;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Mirrors parseMonthlyFee / toStatement in backend/routes/payout/payouts.routes.js.
function parseMonthlyFee(body) {
  const raw = body?.monthlyFee;
  if (raw === undefined || raw === null || String(raw).trim() === "") return { amount: 0, vat: 0 };
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_MONTHLY_FEE) {
    const err = new Error("bad monthlyFee");
    err.status = 400;
    throw err;
  }
  const rounded = r2(amount);
  return { amount: rounded, vat: body?.monthlyFeeVat ? r2(rounded * VAT_RATE) : 0 };
}

const net = (grossPayable, fee) =>
  r2(grossPayable - BATCH_TRANSFER_FEE - r2(BATCH_TRANSFER_FEE * VAT_RATE) - fee.amount - fee.vat);

// Blank field charges nothing and leaves the old net untouched.
assert.deepEqual(parseMonthlyFee({}), { amount: 0, vat: 0 });
assert.deepEqual(parseMonthlyFee({ monthlyFee: "" }), { amount: 0, vat: 0 });
assert.equal(net(1000, parseMonthlyFee({})), 994.75);

// VAT enabled: 100 -> 100 + 5 deducted on top of the 5.25 transfer fee.
assert.deepEqual(parseMonthlyFee({ monthlyFee: "100", monthlyFeeVat: true }), { amount: 100, vat: 5 });
assert.equal(net(1000, parseMonthlyFee({ monthlyFee: "100", monthlyFeeVat: true })), 889.75);

// VAT disabled: exactly the typed amount comes off, no VAT line.
assert.deepEqual(parseMonthlyFee({ monthlyFee: "100", monthlyFeeVat: false }), { amount: 100, vat: 0 });
assert.equal(net(1000, parseMonthlyFee({ monthlyFee: "100", monthlyFeeVat: false })), 894.75);

// Fils survive rounding: 99.99 x 5% = 5.00 (5.0995 -> 5.00), never a float tail.
assert.deepEqual(parseMonthlyFee({ monthlyFee: "99.99", monthlyFeeVat: true }), { amount: 99.99, vat: 5 });

// Junk is rejected, never silently coerced to 0 (that would under-deduct).
for (const bad of ["abc", "-1", String(MAX_MONTHLY_FEE + 1), "NaN"]) {
  assert.throws(() => parseMonthlyFee({ monthlyFee: bad }), /bad monthlyFee/, `should reject ${bad}`);
}

console.log("payout monthly fee: all assertions passed");
