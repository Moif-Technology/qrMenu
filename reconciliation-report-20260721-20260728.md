# Telr vs Sales Reconciliation Report

Source file: `Authorized_Transaction_20260721_20260728.xls`

Method:
- Sales source of truth for online money: `Moifcore.dbo.SalesPaymentSplit`
- Online amount: `BillAmount + TipAmount` where `PayMode = ONLINE` and `IsCancelled = 0`
- Telr gross includes service fee, so Telr is normalized by removing estimated 3.1% service fee.
- `PaymentGateway.dbo.Payment` can be used for SalesID/bill/tip checks, but not date totals because some `CreatedAt` values were manually changed.

## 21/07/2026 - Cleared

Sales online rows: 4

| SalesID | BillNo | Table | Time | Sales bill | Online tip | Sales online total | Telr gross | Status |
|---|---:|---:|---|---:|---:|---:|---:|---|
| 20914 | 60004133 | 39 | 23:06:11 | 27.00 | 0.86 | 27.86 | 28.70 | OK |
| 20922 | 60004138 | 7 | 23:37:09 | 94.00 | 0.00 | 94.00 | 99.91 | Extra fee charged |
| 20923 | 60004139 | 6 | 23:37:52 | 128.75 | 0.00 | 128.75 | 136.85 | Extra fee charged |
| 20924 | 60004140 | 43 | 23:39:51 | 212.75 | 5.00 | 217.75 | 236.30 | Extra fee charged |

Totals:
- Sales bill: 462.50
- Online tip: 5.86
- Sales online bill + tip: 468.36
- Telr gross: 501.76

Notes:
- No split POS/CASH/CREDIT CARD rows on 21st. All 4 bills are full online.
- `PaymentGateway` has all 4 rows linked to the correct SalesIDs, bill, and tip.
- `PaymentGateway.CreatedAt` is wrong for these rows: all show `22/07/2026 15:18:31`.
- Extra charged above bill + tip + normal service fee is approximately 18.91. This is known/refundable due to the old code bug.

## 22/07/2026 - In Review

Sales online rows: 27

Totals:
- Telr rows: 29
- Telr gross: 6,056.16
- Telr normalized bill + tip: 5,874.04
- Sales online bill: 5,798.38
- Online tip: 50.00
- Sales online bill + tip: 5,848.38
- Difference after removing normal service fee: Telr higher by 25.66

Update:
- Cleared mistaken `0.50` tips from PaymentSplitID `242135`, `242136`, and `242137`.
- Affected SalesIDs: `20932`, `20933`, `20939`.
- These tips were an old bug/misunderstanding and were not real customer tips.
- Cleared mistaken `0.50` tip from PaymentSplitID `242139`.
- Affected SalesID: `20944`.
- PaymentGateway and Telr show three `27.00` QR split payments with no tip for SalesID `20944`.

Matched:
- 24 Sales rows matched cleanly to 26 Telr rows.
- Matched Sales total: 4,972.88
- Matched Telr normalized total: 4,970.88
- Matched difference: -2.00, mostly small tip/service-fee rounding.

Grouped split/equal/item payment found:

| SalesID | BillNo | Table | Sales online total | Telr rows | Telr gross total | Telr normalized total | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| 20944 | 60004154 | 34 | 81.00 | 3 | 83.52 | 81.00 | Three QR payments of 27.84 each. No tip after cleanup. |

PaymentGateway for SalesID `20944`:
- Payment rows: 3
- Paid amounts: 27.84 + 27.84 + 27.84 = 83.52
- Paid bill amount: 27.00 + 27.00 + 27.00 = 81.00
- Two rows are still `PENDING`, one row is `PAID`, but Telr shows all three as authorised.

21st + 22nd Sales vs PaymentGateway after cleanup:
- Sales online rows: 31
- Sales online total: 6,316.74
- PaymentGateway bill + tip total: 6,316.7399
- Missing rows: 0
- Money mismatch rows: 0
- Remaining issue: SalesID `20944` has two PaymentGateway rows still marked `PENDING`.

Rows needing attention:

| SalesID | BillNo | Table | Time | Sales bill | Tip | Sales total | Telr gross | Telr normalized | Difference |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|
| 20932 | 60004144 | 22 | 00:05:47 | 549.50 | 0.00 | 549.50 | 584.09 | 566.53 | +17.03 |
| 20933 | 60004145 | 19 | 00:09:54 | 193.75 | 0.00 | 193.75 | 205.95 | 199.76 | +6.01 |
| 20939 | 60004151 | 39 | 00:52:01 | 132.75 | 0.00 | 132.75 | 141.11 | 136.87 | +4.12 |

22nd conclusion:
- No split-pay issue found in these 27 online rows; they are normal `ONLINE` sales rows.
- The 3 early rows now have no tip in SalesPaymentSplit.
- Their Telr normalized difference equals the service fee amount already present in PaymentGateway, which is expected for the old double-fee/refund issue.
- Apart from the refund/extra-fee issue and the pending statuses for SalesID `20944`, 22nd is matching.
