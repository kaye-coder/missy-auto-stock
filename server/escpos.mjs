import { execFile } from "node:child_process";
import thermalPrinter from "node-thermal-printer";

/**
 * Raw ESC/POS printing through CUPS (`lp -o raw`).
 *
 * Rendering an HTML/PDF page is what forced fixed-height pagination (and the
 * stray blank first page). A raw byte stream has no concept of pages at all:
 * the printer feeds exactly as much paper as the content needs.
 */
const {
  printer: ThermalPrinter,
  types: PrinterTypes,
  characterSet: CharacterSet,
  breakLine: BreakLine,
} = thermalPrinter;

const PRINTER_WIDTH_58MM = 32;

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { encoding: "buffer", maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr?.length ? stderr.toString("utf8") : error.message;
        reject(new Error(message.trim() || "Printer command failed"));
        return;
      }
      resolve(stdout.toString("utf8"));
    });
    if (input !== undefined) {
      child.stdin.end(input);
    }
  });
}

export async function listPrinters() {
  try {
    const out = await run("lpstat", ["-p"]);
    return out
      .split("\n")
      .map((l) => l.match(/^printer\s+(\S+)/)?.[1])
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function defaultPrinter() {
  if (process.env.MISSY_PRINTER) return process.env.MISSY_PRINTER;
  try {
    const out = await run("lpstat", ["-d"]);
    const name = out.match(/:\s*(\S+)/)?.[1];
    if (name) return name;
  } catch {
    /* fall through */
  }
  const [first] = await listPrinters();
  return first ?? null;
}

function cleanText(value) {
  return String(value ?? "").replace(/[^\x20-\x7e]/g, "");
}

function createPrinter() {
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: "file:/tmp/missy-receipt.raw",
    width: PRINTER_WIDTH_58MM,
    characterSet: CharacterSet.PC437_USA,
    breakLine: BreakLine.NONE,
    removeSpecialCharacters: true,
  });
}

/** Build one continuous ESC/POS byte stream for a 58mm receipt. */
export async function buildEscPos(blocks, { cut = true, logo = true } = {}) {
  const printer = createPrinter();

  printer.clear();
  printer.initHardware();
  printer.setTypeFontA();
  printer.setLineSpacing(30);

  if (logo) {
    try {
      const { fileURLToPath } = await import("node:url");
      const path = await import("node:path");
      const here = path.dirname(fileURLToPath(import.meta.url));
      printer.alignCenter();
      await printer.printImage(path.join(here, "..", "public", "missy-logo.png"));
      printer.alignLeft();
    } catch {
      /* logo is optional — never block a receipt on it */
    }
  }

  for (const block of blocks) {
    const text = cleanText(block.text);

    printer.setTextNormal();
    printer.setTypeFontA();
    if (block.center) printer.alignCenter();
    else printer.alignLeft();

    printer.bold(Boolean(block.bold || block.double));
    // Only emphasised lines (business name, TOTAL) get double size; everything
    // else stays single-width so label/value pairs fit on one line.
    if (block.double) printer.setTextSize(1, 1);
    else printer.setTextSize(0, 0);

    printer.println(text);
  }

  printer.setTextNormal();
  printer.setTextSize(0, 0);
  printer.bold(false);
  printer.alignLeft();
  printer.newLine();
  if (cut) printer.partialCut({ verticalTabAmount: 1 });

  return printer.getBuffer();
}

/** Send blocks to the thermal printer as one continuous raw job. */
export async function printRaw(blocks, printer) {
  const target = printer || (await defaultPrinter());
  if (!target) throw new Error("No CUPS printer found");
  const payload = await buildEscPos(blocks);
  await run("lp", ["-d", target, "-o", "raw", "-t", "missy-receipt"], payload);
  return { printer: target, bytes: payload.length, mode: "escpos-raw", width: PRINTER_WIDTH_58MM };
}
