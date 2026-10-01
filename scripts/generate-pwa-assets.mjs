// Generates all PWA icons + Apple splash screens from inline SVG.
//   npm run pwa-assets        (requires the `sharp` devDependency)
// Output: public/icons/*.png, public/splash/*.png

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ICONS = path.join(root, "public", "icons");
const SPLASH = path.join(root, "public", "splash");

const BG = "#0a0c10";

/** The mark: two cards crossing (give = violet, get = teal) with a gold exchange badge. */
function mark(size = 1024, scale = 1) {
  const s = scale;
  return `
  <g transform="translate(${size / 2} ${size / 2}) scale(${s}) translate(-512 -540)">
    <g transform="rotate(-14 420 540)">
      <rect x="250" y="300" width="330" height="460" rx="40" fill="#8b7cff"/>
      <rect x="276" y="326" width="278" height="200" rx="18" fill="#ffffff" opacity="0.22"/>
      <rect x="276" y="552" width="200" height="22" rx="11" fill="#ffffff" opacity="0.25"/>
      <rect x="276" y="592" width="150" height="22" rx="11" fill="#ffffff" opacity="0.18"/>
    </g>
    <g transform="rotate(14 604 540)">
      <rect x="444" y="300" width="330" height="460" rx="40" fill="#2ed3b7"/>
      <rect x="470" y="326" width="278" height="200" rx="18" fill="#ffffff" opacity="0.22"/>
      <rect x="470" y="552" width="200" height="22" rx="11" fill="#ffffff" opacity="0.25"/>
      <rect x="470" y="592" width="150" height="22" rx="11" fill="#ffffff" opacity="0.18"/>
    </g>
    <circle cx="512" cy="700" r="128" fill="#ffcb2e" stroke="${BG}" stroke-width="22"/>
    <g fill="none" stroke="${BG}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
      <path d="M452 668h108 M528 636l32 32-32 32"/>
      <path d="M572 734H464 M496 702l-32 32 32 32"/>
    </g>
  </g>`;
}

function iconSvg(size, { maskable = false, rounded = false } = {}) {
  const r = rounded ? size * 0.22 : 0;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
    <defs><radialGradient id="g" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="#1d2433"/><stop offset="1" stop-color="${BG}"/></radialGradient></defs>
    <rect width="1024" height="1024" rx="${(r * 1024) / size}" fill="url(#g)"/>
    ${mark(1024, maskable ? 0.72 : 0.92)}
  </svg>`);
}

function splashSvg(w, h) {
  const markSize = Math.round(Math.min(w, h) * 0.42);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><radialGradient id="g" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#161b26"/><stop offset="1" stop-color="${BG}"/></radialGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <svg x="${(w - markSize) / 2}" y="${h * 0.42 - markSize / 2}" width="${markSize}" height="${markSize}" viewBox="0 0 1024 1024">${mark(1024, 1)}</svg>
    <text x="${w / 2}" y="${h * 0.42 + markSize * 0.62}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="800"
      font-size="${Math.round(w * 0.075)}" fill="#ffffff" letter-spacing="1">TradeDesk</text>
  </svg>`);
}

// [css width, css height, devicePixelRatio] — must match app/layout.tsx SPLASH list.
const DEVICES = [
  [440, 956, 3], [402, 874, 3], [420, 912, 3], [430, 932, 3], [393, 852, 3], [390, 844, 3],
  [428, 926, 3], [375, 812, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3], [375, 667, 2],
];

await mkdir(ICONS, { recursive: true });
await mkdir(SPLASH, { recursive: true });

const icons = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["icon-maskable-512.png", 512, { maskable: true }],
  ["apple-touch-icon.png", 180, {}], // iOS applies its own corner mask — keep square, no transparency
  ["favicon-32.png", 32, { rounded: true }],
];
for (const [name, size, opts] of icons) {
  await sharp(iconSvg(size, opts)).resize(size, size).png().toFile(path.join(ICONS, name));
}

for (const [w, h, dpr] of DEVICES) {
  const pw = w * dpr;
  const ph = h * dpr;
  await sharp(splashSvg(pw, ph)).png({ compressionLevel: 9, palette: true }).toFile(path.join(SPLASH, `splash-${pw}x${ph}.png`));
}

console.log(`✓ ${icons.length} icons, ${DEVICES.length} splash screens`);
