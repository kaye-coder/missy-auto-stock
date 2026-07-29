import { execFile } from "node:child_process";

/**
 * Raw ESC/POS printing through CUPS (`lp -o raw`).
 *
 * Rendering an HTML/PDF page is what forced fixed-height pagination (and the
 * stray blank first page). A raw byte stream has no concept of pages at all:
 * the printer feeds exactly as much paper as the content needs.
 */
const ESC = 0x1b;
const GS = 0x1d;

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { encoding: "buffer" }, (error, stdout) =>
      error ? reject(error) : resolve(stdout.toString("utf8")),
    );
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

/** Build the ESC/POS byte stream for the rendered receipt blocks. */
export function buildEscPos(blocks, { cut = true } = {}) {
  const parts = [];
  const push = (...bytes) => parts.push(Buffer.from(bytes));
  const text = (s) => parts.push(Buffer.from(s, "ascii"));

  push(ESC, 0x40); // initialise
  push(ESC, 0x74, 0x00); // code page CP437

  for (const b of blocks) {
    push(ESC, 0x61, b.center ? 0x01 : 0x00); // alignment
    push(ESC, 0x45, b.bold || b.double ? 0x01 : 0x00); // emphasis
    push(GS, 0x21, b.double ? 0x11 : 0x00); // double width + height
    text(String(b.text ?? "").replace(/[^\x20-\x7e]/g, ""));
    text("\n");
  }

  push(ESC, 0x61, 0x00);
  push(ESC, 0x45, 0x00);
  push(GS, 0x21, 0x00);
  text("\n\n\n");
  if (cut) push(GS, 0x56, 0x42, 0x00); // partial cut with feed
  return Buffer.concat(parts);
}

/** Send blocks to the thermal printer as one continuous raw job. */
export async function printRaw(blocks, printer) {
  const target = printer || (await defaultPrinter());
  if (!target) throw new Error("No CUPS printer found");
  const payload = buildEscPos(blocks);
  await run("lp", ["-d", target, "-o", "raw", "-o", "media=X58mmY3276mm", "-t", "missy-receipt"], payload);
  return { printer: target, bytes: payload.length };
}
