// frontend/src/lib/exportPayouts.js
// Shared PDF/Excel export for the payout dashboards (restaurant + admin).
// Callers fetch the full (unpaginated) row set from /transactions/export
// and pass it here with a column spec; this module only handles rendering.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { LETTERHEAD_BANNER, LETTERHEAD_CONTACT, LETTERHEAD_PAGE, LETTERHEAD_WATERMARK } from "./letterheadAssets.js";

const CURRENCY = "AED";

export const fmtMoney = (n) =>
  Number(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Row timestamps (createdAt, transferDate, ...) come from the backend as
// "wall clock tagged UTC" ISO strings (see backend/utils/payoutDates.js) -
// timeZone: "UTC" reads those digits back literally instead of re-converting
// them into the viewer's local time, which would double-apply the offset.
export const fmtDateTime = (d) => {
  if (!d) return "-";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? "-"
    : dt.toLocaleString("en-AE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
};

// The "Generated:" stamp is a genuine real-time Date (when the export ran),
// not a backend wall-clock value - format it in the viewer's actual local time.
const fmtLocalNow = (d) =>
  d.toLocaleString("en-AE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function rangeLabel(fromDate, toDate) {
  if (!fromDate && !toDate) return "All dates";
  const from = fromDate ? new Date(fromDate).toLocaleDateString("en-AE", { timeZone: "UTC" }) : "...";
  const to = toDate ? new Date(toDate).toLocaleDateString("en-AE", { timeZone: "UTC" }) : "...";
  return `${from} to ${to}`;
}

/**
 * columns: [{ header: "Date", key: "date" | (row) => value, align?: "right" }]
 * rows: array of plain objects already shaped for display
 */
export function exportPayoutsPdf({ title, fromDate, toDate, columns, rows, fileName, footerNote }) {
  const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait", unit: "pt" });

  doc.setFontSize(14);
  doc.text(title, 40, 40);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Date range: ${rangeLabel(fromDate, toDate)}`, 40, 58);
  doc.text(`Generated: ${fmtLocalNow(new Date())}`, 40, 72);
  doc.text(`${rows.length} record${rows.length === 1 ? "" : "s"}`, 40, 86);

  autoTable(doc, {
    startY: 100,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => (typeof c.key === "function" ? c.key(r) : r[c.key] ?? "-"))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [15, 15, 20] },
    columnStyles: columns.reduce((acc, c, i) => {
      if (c.align === "right") acc[i] = { halign: "right" };
      return acc;
    }, {}),
    margin: { left: 40, right: 40 }
  });

  if (footerNote) {
    const finalY = doc.lastAutoTable.finalY || 100;
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(footerNote, 40, finalY + 20);
  }

  doc.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
}

export function exportPayoutsExcel({ title, fromDate, toDate, columns, rows, fileName }) {
  const header = columns.map((c) => c.header);
  const body = rows.map((r) => columns.map((c) => (typeof c.key === "function" ? c.key(r) : r[c.key] ?? "")));

  const sheetData = [
    [title],
    [`Date range: ${rangeLabel(fromDate, toDate)}`],
    [`Generated: ${fmtLocalNow(new Date())}`],
    [],
    header,
    ...body
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws["!cols"] = columns.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Payouts");
  XLSX.writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}

// Date-only, UTC-literal (same reasoning as fmtDateTime above).
const fmtStatementDay = (d) => {
  if (!d) return "-";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? "-"
    : dt.toLocaleDateString("en-AE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
};

const fmtStatementRange = (from, to) => {
  const a = fmtStatementDay(from);
  const b = fmtStatementDay(to);
  if (a === "-") return b;
  return a === b ? a : `${a} - ${b}`;
};

/**
 * One settlement statement, matching the document DeynoQR already issues:
 *
 *   OPAIA QR PAYMENT SETTLEMENT STATEMENT
 *   Batch Number: BATCH08042026
 *   Description            | Value
 *   Dates                  | 22 July 2026 - 23 July 2026
 *   Total Transactions     | 59
 *   ...
 *   NET AMOUNT TRANSFERRED | AED 11,215.09
 *
 * `s` is one row from /payouts/my-history or /payouts/history.
 */
export function exportSettlementStatementPdf({ restaurantName, statement: s, fileName }) {
  // compress: true matters here - the watermark is a 775x685 PNG, and without
  // stream compression jsPDF embeds it raw and the statement balloons to ~1.6MB.
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: LETTERHEAD_PAGE.format,
    compress: true
  });
  const left = 56;

  // Letterhead first so everything else prints on top of it. Watermark before
  // the logo: it is the big pale mark the table sits over, exactly as placed in
  // the statement PDF this stationery came from.
  doc.addImage(
    LETTERHEAD_WATERMARK.dataUri, LETTERHEAD_WATERMARK.format,
    LETTERHEAD_WATERMARK.x, LETTERHEAD_WATERMARK.y,
    LETTERHEAD_WATERMARK.width, LETTERHEAD_WATERMARK.height,
    "letterhead-watermark", "FAST"
  );
  doc.addImage(
    LETTERHEAD_BANNER.dataUri, LETTERHEAD_BANNER.format,
    LETTERHEAD_BANNER.x, LETTERHEAD_BANNER.y,
    LETTERHEAD_BANNER.width, LETTERHEAD_BANNER.height,
    "letterhead-banner", "FAST"
  );

  // Contact block, right-aligned against the page margin so it balances the
  // logo across the top of the sheet.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(LETTERHEAD_CONTACT.fontSize);
  doc.setTextColor(60);
  LETTERHEAD_CONTACT.lines.forEach((line, i) => {
    doc.text(line, LETTERHEAD_CONTACT.right,
      LETTERHEAD_CONTACT.firstLineY + i * LETTERHEAD_CONTACT.lineHeight, { align: "right" });
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(20);
  doc.setTextColor(21, 94, 117); // the statement's dark teal
  doc.text(`${String(restaurantName || "Restaurant").toUpperCase()} QR PAYMENT SETTLEMENT STATEMENT`,
    left, 108, { maxWidth: 483 });

  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.setFont("helvetica", "bold");
  doc.text("Batch Number: ", left, 152);
  const labelWidth = doc.getTextWidth("Batch Number: ");
  doc.setFont("helvetica", "normal");
  doc.text(String(s.statementNo || `BATCH-${s.batchNo}`), left + labelWidth, 152);

  if (s.transferRef) {
    doc.setFont("helvetica", "bold");
    doc.text("Transfer Reference: ", left, 170);
    const refWidth = doc.getTextWidth("Transfer Reference: ");
    doc.setFont("helvetica", "normal");
    doc.text(String(s.transferRef), left + refWidth, 170);
  }

  const rows = [
    ["Dates", fmtStatementRange(s.firstTxnAt, s.lastTxnAt)],
    ["Total Transactions", String(s.txnCount ?? "-")],
    ["Total Bill Amount", fmtMoney(s.totalBillAmount)],
    ["Tip Amount", fmtMoney(s.tipAmount)],
    ["Service Fee", fmtMoney(s.serviceFee)],
    ["VAT on Service Fee", fmtMoney(s.serviceFeeVat)],
    ["Gross Payable", fmtMoney(s.grossPayable)],
    ["Transfer Fee", fmtMoney(s.transferFee)],
    ["VAT on Transfer Fee", fmtMoney(s.transferFeeVat)],
    ["NET AMOUNT TRANSFERRED", `${CURRENCY} ${fmtMoney(s.netTransferred)}`]
  ];

  autoTable(doc, {
    startY: s.transferRef ? 190 : 172,
    head: [["Description", "Value"]],
    body: rows,
    theme: "grid",
    // fillColor false, not white: the cells have to stay transparent so the
    // letterhead watermark shows through the table the way it does on the
    // stationery. A white fill would paint it out.
    styles: { fontSize: 11, cellPadding: 7, lineColor: [30, 30, 30], lineWidth: 0.7, textColor: 30, fillColor: false },
    headStyles: { fillColor: false, textColor: 30, fontStyle: "normal" },
    // Sums to exactly the printable width (612pt page less the two 56pt
    // margins) so autoTable does not report leftover width.
    columnStyles: { 0: { cellWidth: 280 }, 1: { cellWidth: 220 } },
    margin: { left, right: left },
    // The closing line is the number that matters - print it bold and bigger,
    // exactly like the issued statement does.
    didParseCell: (data) => {
      if (data.row.index === rows.length - 1 && data.section === "body") {
        data.cell.styles.fontStyle = "bold";
        if (data.column.index === 1) data.cell.styles.fontSize = 15;
      }
    }
  });

  const finalY = doc.lastAutoTable?.finalY || 400;
  doc.setFontSize(8);
  doc.setTextColor(120);
  if (s.transferDate) {
    doc.text(`Payout date: ${fmtStatementDay(s.transferDate)}`, left, finalY + 22);
  }
  doc.text(`Generated: ${fmtLocalNow(new Date())}`, left, finalY + (s.transferDate ? 36 : 22));

  const name = fileName || `settlement-${s.statementNo || s.batchNo}`;
  doc.save(name.endsWith(".pdf") ? name : `${name}.pdf`);
}

export { CURRENCY };
