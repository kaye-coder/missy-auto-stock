import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";

/**
 * PNG -> ESC/POS raster bitmap (GS v 0).
 *
 * Thermal printers cannot interpret PNG/JPEG bytes. Sending anything but a
 * packed 1-bit-per-pixel raster is what makes them spit out "?aC" noise: the
 * bytes fall through to the text parser. So we decode the PNG ourselves,
 * flatten alpha onto white, scale to the head's dot width, Floyd–Steinberg
 * dither to pure black/white, then pack 8 pixels per byte.
 */
export async function pngToRaster(
  filePath,
  { targetWidth = 320, maxHeight = 240, threshold = 200, dither = false } = {},
) {
  const png = PNG.sync.read(await readFile(filePath));

  // 1. grayscale with alpha flattened onto white paper
  const gray = new Float32Array(png.width * png.height);
  for (let i = 0; i < png.width * png.height; i++) {
    const o = i * 4;
    const a = png.data[o + 3] / 255;
    const r = png.data[o] * a + 255 * (1 - a);
    const g = png.data[o + 1] * a + 255 * (1 - a);
    const b = png.data[o + 2] * a + 255 * (1 - a);
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // 2. scale (box filter) to the printer dot grid; width must be a multiple of 8
  let w = Math.min(targetWidth, 576);
  if ((png.height / png.width) * w > maxHeight) w = (maxHeight * png.width) / png.height;
  w = Math.max(8, Math.round(w) - (Math.round(w) % 8));
  const h = Math.max(1, Math.round((png.height / png.width) * w));

  const scaled = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor((y * png.height) / h);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * png.height) / h));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor((x * png.width) / w);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * png.width) / w));
      let sum = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++)
        for (let sx = sx0; sx < sx1; sx++) {
          sum += gray[sy * png.width + sx];
          n++;
        }
      scaled[y * w + x] = sum / n;
    }
  }

  // 3. 1-bit conversion. A flat-colour logo prints far cleaner with a plain
  // threshold; dithering only helps photographic art, where it avoids banding.
  const bits = new Uint8Array(w * h);
  if (dither) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const old = scaled[i];
        const nv = old < threshold ? 0 : 255;
        bits[i] = nv === 0 ? 1 : 0; // 1 = burn a dot
        const err = old - nv;
        if (x + 1 < w) scaled[i + 1] += (err * 7) / 16;
        if (y + 1 < h) {
          if (x > 0) scaled[i + w - 1] += (err * 3) / 16;
          scaled[i + w] += (err * 5) / 16;
          if (x + 1 < w) scaled[i + w + 1] += (err * 1) / 16;
        }
      }
    }
  } else {
    for (let i = 0; i < w * h; i++) bits[i] = scaled[i] < threshold ? 1 : 0;
  }


  // 4. centre the logo on the full print head so we don't rely on the printer
  //    honouring ESC a 1 (centre) for graphics — many cheap heads do not.
  const headW = 384; // 58mm = 384 dots
  const fullW = Math.max(w, headW);
  const offset = Math.max(0, Math.floor((fullW - w) / 2 / 8) * 8);
  const canvas = new Uint8Array(fullW * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) canvas[y * fullW + offset + x] = bits[y * w + x];

  // 5a. GS v 0 raster payload
  const bytesPerRow = fullW / 8;
  const data = Buffer.alloc(bytesPerRow * h, 0);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < fullW; x++)
      if (canvas[y * fullW + x]) data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);

  const header = Buffer.from([
    0x1d,
    0x76,
    0x30,
    0x00, // GS v 0, normal mode
    bytesPerRow & 0xff,
    (bytesPerRow >> 8) & 0xff,
    h & 0xff,
    (h >> 8) & 0xff,
  ]);

  // 5b. ESC * m=33 (24-dot double density) — the most widely supported bit
  //     image command. Printers that silently ignore GS v 0 (and then dump the
  //     payload through the text parser as garbage characters) handle this one.
  const stripes = [];
  stripes.push(Buffer.from([0x1b, 0x33, 0x18])); // ESC 3 24 -> line spacing = 24 dots
  for (let top = 0; top < h; top += 24) {
    const stripe = Buffer.alloc(3 * fullW);
    for (let x = 0; x < fullW; x++) {
      for (let k = 0; k < 24; k++) {
        const y = top + k;
        if (y >= h) continue;
        if (canvas[y * fullW + x]) stripe[x * 3 + (k >> 3)] |= 0x80 >> (k & 7);
      }
    }
    stripes.push(
      Buffer.from([0x1b, 0x2a, 33, fullW & 0xff, (fullW >> 8) & 0xff]),
      stripe,
      Buffer.from([0x0a]),
    );
  }
  stripes.push(Buffer.from([0x1b, 0x32])); // ESC 2 -> restore default line spacing

  return {
    buffer: Buffer.concat([header, data]),
    escStar: Buffer.concat(stripes),
    width: fullW,
    height: h,
  };
}

