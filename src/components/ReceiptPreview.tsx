import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Download, X } from "lucide-react";
import { loadSettings } from "@/lib/settings";
import { logoUrl } from "@/lib/logo";
import {
  PAPER_PROFILES,
  buildReceiptBody,
  buildReceiptStyles,
  buildTextDocument,
  downloadReceiptPdf,
  loadPaperSize,
  printReceiptDocument,
  savePaperSize,
  type PaperSize,
  type ReceiptData,
} from "@/lib/receipt";

interface Props {
  receipt: ReceiptData | null;
  onClose: () => void;
}

/** Print preview that renders exactly what the printer will produce. */
export function ReceiptPreview({ receipt, onClose }: Props) {
  const [paper, setPaper] = useState<PaperSize>("80mm");
  useEffect(() => setPaper(loadPaperSize()), []);

  const srcDoc = useMemo(() => {
    if (!receipt) return "";
    if (PAPER_PROFILES[paper].thermal)
      return buildTextDocument(receipt, loadSettings(), paper, false, logoUrl);
    return `<!doctype html><html><head><meta charset="utf-8" /><style>${buildReceiptStyles(
      paper,
    )} body{padding:8px 0;}</style></head><body>${buildReceiptBody(receipt, loadSettings())}</body></html>`;
  }, [receipt, paper]);

  const pick = (p: PaperSize) => {
    setPaper(p);
    savePaperSize(p);
  };

  const handlePrint = () => {
    if (!receipt) return;
    try {
      printReceiptDocument(receipt, paper);
    } catch {
      toast.error("Printing failed. Please try again.");
    }
  };

  const handlePdf = () => {
    if (!receipt) return;
    try {
      downloadReceiptPdf(receipt, paper);
    } catch {
      toast.error("Could not create the PDF. Please try again.");
    }
  };

  return (
    <Dialog open={!!receipt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receipt preview</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <Label className="text-sm text-muted-foreground">Paper</Label>
          <Select value={paper} onValueChange={(v) => pick(v as PaperSize)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(PAPER_PROFILES).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="max-h-[55vh] overflow-auto rounded-md border bg-muted/30 p-3">
          <iframe
            title="Receipt preview"
            srcDoc={srcDoc}
            className="mx-auto block h-[52vh] w-full rounded bg-white"
          />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onClose}>
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePdf}>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
            <Button onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print receipt
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
