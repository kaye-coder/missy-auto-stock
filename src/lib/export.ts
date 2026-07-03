import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { loadSettings } from "@/lib/settings";

export interface ExportColumn<T> {
  header: string;
  accessor: (row: T) => string | number | null | undefined;
}

export interface ExportOptions<T> {
  filename: string;
  title: string;
  columns: ExportColumn<T>[];
  rows: T[];
}

function toMatrix<T>(opts: ExportOptions<T>): (string | number)[][] {
  const header = opts.columns.map((c) => c.header);
  const body = opts.rows.map((r) =>
    opts.columns.map((c) => {
      const v = c.accessor(r);
      if (v === null || v === undefined) return "";
      return typeof v === "number" ? v : String(v);
    }),
  );
  return [header, ...body];
}

export function exportToExcel<T>(opts: ExportOptions<T>) {
  const matrix = toMatrix(opts);
  const ws = XLSX.utils.aoa_to_sheet(matrix);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, opts.title.slice(0, 30));
  XLSX.writeFile(wb, `${opts.filename}.xlsx`);
}

export function exportToPdf<T>(opts: ExportOptions<T>) {
  const settings = loadSettings();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(14);
  doc.setTextColor(190, 24, 93);
  doc.text(settings.businessName || "Missy", 40, 40);

  doc.setFontSize(9);
  doc.setTextColor(90);
  const idLines: string[] = [];
  if (settings.tinNumber) idLines.push(`TIN: ${settings.tinNumber}`);
  if (settings.businessPhone) idLines.push(`Tel: ${settings.businessPhone}`);
  if (settings.businessAddress) idLines.push(settings.businessAddress);
  doc.text(idLines.join("  •  "), 40, 56);

  doc.setFontSize(12);
  doc.setTextColor(30);
  doc.text(opts.title, 40, 80);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString()}`, 40, 94);

  const matrix = toMatrix(opts);
  autoTable(doc, {
    startY: 110,
    head: [matrix[0] as string[]],
    body: matrix.slice(1) as (string | number)[][],
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [236, 72, 153], textColor: 255 },
    alternateRowStyles: { fillColor: [253, 242, 248] },
    margin: { left: 40, right: 40 },
  });

  doc.save(`${opts.filename}.pdf`);
}
