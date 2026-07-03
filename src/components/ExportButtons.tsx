import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileText } from "lucide-react";
import { exportToExcel, exportToPdf, type ExportColumn } from "@/lib/export";

interface Props<T> {
  filename: string;
  title: string;
  columns: ExportColumn<T>[];
  rows: T[];
  size?: "sm" | "default";
}

export function ExportButtons<T>({ filename, title, columns, rows, size = "sm" }: Props<T>) {
  const disabled = rows.length === 0;
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size={size}
        disabled={disabled}
        onClick={() => exportToExcel({ filename, title, columns, rows })}
      >
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        Excel
      </Button>
      <Button
        variant="outline"
        size={size}
        disabled={disabled}
        onClick={() => exportToPdf({ filename, title, columns, rows })}
      >
        <FileText className="mr-2 h-4 w-4" />
        PDF
      </Button>
    </div>
  );
}
