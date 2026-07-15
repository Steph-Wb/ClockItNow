import zlib from 'zlib';

/**
 * Pures PNG-Rendering der App-Grafiken (kein Electron-Import) – nutzbar im
 * Hauptprozess (via trayIcon.ts) und in Build-Scripts (ICO-Generierung).
 * Das Logo zeichnet public/logo.svg nach (Koordinatensystem 40x40,
 * skaliert per SDF-Rendering mit Antialiasing).
 */

function crc32(buf: Buffer): number {
  let c: number;
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba: Buffer, size: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  // Scanlines: Filterbyte 0 + Rohdaten pro Zeile
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    rgba.copy(raw, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

type RGB = [number, number, number];
const TEAL: RGB = [0, 188, 212];   // #00BCD4
const GREY: RGB = [128, 134, 139];
const BG: RGB = [31, 41, 55];      // #1f2937
const WHITE: RGB = [249, 250, 251]; // #F9FAFB

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

/** Signierte Distanz zu abgerundetem Rechteck (Zentrum, Halbmaße, Eckradius) */
function sdRoundRect(x: number, y: number, cx: number, cy: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Distanz zu Liniensegment (für Zeiger mit runden Enden) */
function sdSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
  const h = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay || 1));
  return Math.hypot(pax - bax * h, pay - bay * h);
}

/** Ebenen (Coverage + Farbe) alpha-korrekt zu einem RGBA-Buffer kompositieren */
function render(size: number, layersAt: (x: number, y: number) => [number, RGB][]): Buffer {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const [cov, col] of layersAt(x + 0.5, y + 0.5)) {
        if (cov <= 0) continue;
        r = col[0] * cov + r * (1 - cov);
        g = col[1] * cov + g * (1 - cov);
        b = col[2] * cov + b * (1 - cov);
        a = cov + a * (1 - cov);
      }
      const i = (y * size + x) * 4;
      // Premultiplied → straight alpha (PNG erwartet nicht-vormultipliziert)
      px[i] = Math.round(a > 0 ? r / a : 0);
      px[i + 1] = Math.round(a > 0 ? g / a : 0);
      px[i + 2] = Math.round(a > 0 ? b / a : 0);
      px[i + 3] = Math.round(a * 255);
    }
  }
  return px;
}

/** App-Logo (wie public/logo.svg) als PNG-Bytes */
export function logoPng(size: number): Buffer {
  const s = size / 40;
  const rgba = render(size, (X, Y) => {
    const dC = Math.hypot(X - 20 * s, Y - 22 * s);
    return [
      [clamp01(0.5 - sdRoundRect(X, Y, 20 * s, 20 * s, 20 * s, 20 * s, 10 * s)), BG],
      [clamp01(0.5 - (Math.abs(dC - 13 * s) - 1.25 * s)), TEAL],                          // Uhr-Kreis
      [clamp01(0.5 - (sdSegment(X, Y, 20 * s, 22 * s, 20 * s, 13 * s) - 1.25 * s)), TEAL], // Stundenzeiger
      [clamp01(0.5 - (sdSegment(X, Y, 20 * s, 22 * s, 27 * s, 22 * s) - 1.25 * s)), WHITE], // Minutenzeiger
      [clamp01(0.5 - (dC - 2 * s)), TEAL],                                                 // Mittelpunkt
      [clamp01(0.5 - sdRoundRect(X, Y, 20 * s, 6.5 * s, 4 * s, 1.5 * s, 1.5 * s)), TEAL],  // Aufzieher
    ];
  });
  return encodePng(rgba, size);
}

/** Tray-Uhr (Türkis = Timer läuft, Grau = kein Timer) als PNG-Bytes */
export function clockPng(running: boolean, size = 32): Buffer {
  const color = running ? TEAL : GREY;
  const c = size / 2 - 0.5, r = size / 2 - 2;
  const rgba = render(size, (X, Y) => {
    const dC = Math.hypot(X - c, Y - c);
    return [
      [clamp01(0.5 - (dC - r)), color],
      [clamp01(0.5 - (sdSegment(X, Y, c, c, c, c - r * 0.62) - 1)), WHITE], // Minutenzeiger
      [clamp01(0.5 - (sdSegment(X, Y, c, c, c + r * 0.45, c) - 1)), WHITE], // Stundenzeiger
    ];
  });
  return encodePng(rgba, size);
}
