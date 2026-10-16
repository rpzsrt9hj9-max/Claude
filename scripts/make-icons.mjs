// Génère les icônes PNG de la PWA (sans dépendance) : carré arrondi bleu + coche blanche.
import fs from 'node:fs';
import zlib from 'node:zlib';

function crc32(buf) {
  let c, crc = ~0;
  for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return ~crc >>> 0;
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function icon(size, { rounded = true } = {}) {
  const s = size / 512, raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const X = (x + 0.5) / s, Y = (y + 0.5) / s, r = 112;
      const cx = Math.min(Math.max(X, r), 512 - r), cy = Math.min(Math.max(Y, r), 512 - r);
      const inside = !rounded || Math.hypot(X - cx, Y - cy) <= r;
      const d = Math.min(segDist(X, Y, 136, 270, 216, 350), segDist(X, Y, 216, 350, 376, 174));
      const check = d <= 28;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const [R, G, B] = check ? [255, 255, 255] : [2, 132, 199];
      raw[o] = R; raw[o + 1] = G; raw[o + 2] = B; raw[o + 3] = inside ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
fs.writeFileSync('public/icon-192.png', icon(192));
fs.writeFileSync('public/icon-512.png', icon(512, { rounded: false }));
fs.writeFileSync('public/apple-touch-icon.png', icon(180, { rounded: false }));
console.log('Icônes générées dans public/');
