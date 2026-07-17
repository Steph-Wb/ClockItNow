// Erzeugt build/icon.ico aus dem Laufzeit-Logo-Renderer (dist/electron/logoPng.js).
// ICO-Container mit PNG-Einträgen (ab Windows Vista unterstützt) – kein Binär-Asset im Repo.
// Voraussetzung: `npm run build` (tsc) ist gelaufen.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { logoPng } = await import(new URL('../dist/electron/logoPng.js', import.meta.url));

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const pngs = SIZES.map(s => ({ size: s, data: logoPng(s) }));

// ICONDIR (6 Bytes) + ICONDIRENTRY (16 Bytes je Bild) + PNG-Blobs
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // Typ 1 = Icon
header.writeUInt16LE(pngs.length, 4);

const entries = [];
let offset = 6 + pngs.length * 16;
for (const { size, data } of pngs) {
  const e = Buffer.alloc(16);
  e.writeUInt8(size === 256 ? 0 : size, 0);  // Breite (0 = 256)
  e.writeUInt8(size === 256 ? 0 : size, 1);  // Höhe (0 = 256)
  e.writeUInt8(0, 2);   // Farbpalette (0 = keine)
  e.writeUInt8(0, 3);   // reserved
  e.writeUInt16LE(1, 4);  // Farbebenen
  e.writeUInt16LE(32, 6); // Bits pro Pixel
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += data.length;
  entries.push(e);
}

const outDir = path.join(root, 'build');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'icon.ico');
fs.writeFileSync(outFile, Buffer.concat([header, ...entries, ...pngs.map(p => p.data)]));
console.log(`${outFile} geschrieben (${SIZES.join('/')} px, ${offset} Bytes)`);
