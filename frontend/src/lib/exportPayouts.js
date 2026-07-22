// frontend/src/lib/exportPayouts.js
// Shared PDF/Excel export for the payout dashboards (restaurant + admin).
// Callers fetch the full (unpaginated) row set from /transactions/export
// and pass it here with a column spec; this module only handles rendering.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

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

export { CURRENCY };
