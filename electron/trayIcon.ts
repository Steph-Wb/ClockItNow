import zlib from 'zlib';
import { nativeImage, NativeImage } from 'electron';

/**
 * Erzeugt die Tray-Icons (32x32, Uhr-Symbol) zur Laufzeit als PNG –
 * bewusst ohne Binär-Assets im Repo. Teal = Timer läuft, Grau = kein Timer.
 */

const SIZE = 32;

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

function encodePng(rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  // Scanlines: Filterbyte 0 + Rohdaten pro Zeile
  const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
  for (let y = 0; y < SIZE; y++) {
    rgba.copy(raw, y * (1 + SIZE * 4) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawClock(color: [number, number, number]): Buffer {
  const px = Buffer.alloc(SIZE * SIZE * 4);
  const cx = SIZE / 2 - 0.5, cy = SIZE / 2 - 0.5, r = SIZE / 2 - 2;

  const set = (x: number, y: number, rgb: [number, number, number], a: number) => {
    const i = (y * SIZE + x) * 4;
    px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2];
    px[i + 3] = Math.max(px[i + 3], Math.round(a * 255));
  };

  // Zifferblatt (weich gerandete Scheibe)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const a = Math.min(Math.max(r + 0.5 - d, 0), 1);
      if (a > 0) set(x, y, color, a);
    }
  }

  // Zeiger in Weiß: Minutenzeiger nach oben, Stundenzeiger nach rechts
  const white: [number, number, number] = [255, 255, 255];
  const cxi = Math.round(cx), cyi = Math.round(cy);
  for (let y = cyi - Math.round(r * 0.62); y <= cyi; y++) { set(cxi, y, white, 1); set(cxi + 1, y, white, 1); }
  for (let x = cxi; x <= cxi + Math.round(r * 0.45); x++) { set(x, cyi, white, 1); set(x, cyi + 1, white, 1); }

  return px;
}

export function trayIcon(running: boolean): NativeImage {
  const color: [number, number, number] = running ? [0, 188, 212] : [128, 134, 139];
  return nativeImage.createFromBuffer(encodePng(drawClock(color)), { scaleFactor: 1 });
}
