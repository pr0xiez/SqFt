import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ICONS_DIR = path.join(process.cwd(), "public", "icons");
mkdirSync(ICONS_DIR, { recursive: true });

const OAK = "#3d3228";
const LINEN = "#f5f0e8";
const VERMIL = "#c0341a";

// Builds the SVG source at a given size.
// maskable=true: fills full square (safe zone handled by padding),
// maskable=false: rounded corners.
function buildSvg(size: number, maskable = false): Buffer {
  const rx = maskable ? 0 : Math.round(size * 0.15);

  // For maskable icons the PWA safe zone is the inner 80% circle,
  // so we scale content down to 72% and keep it centred.
  const s = maskable ? 0.72 : 1.0;
  const cx = size / 2;
  const cy = size / 2;

  // "ft" — large serif, centred slightly left of icon centre
  const ftSize = Math.round(size * 0.39 * s);
  const ftX = Math.round(cx - size * 0.04 * s);
  const ftY = Math.round(cy + size * 0.1 * s);

  // "2" superscript — upper-right, vermillion
  const supSize = Math.round(size * 0.22 * s);
  const supX = Math.round(cx + size * 0.29 * s);
  const supY = Math.round(cy - size * 0.11 * s);

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${OAK}" rx="${rx}"/>
  <text x="${ftX}" y="${ftY}"
        font-family="Georgia,'Times New Roman',serif"
        font-size="${ftSize}" font-weight="700"
        fill="${LINEN}" text-anchor="middle">ft</text>
  <text x="${supX}" y="${supY}"
        font-family="Georgia,'Times New Roman',serif"
        font-size="${supSize}" font-weight="700"
        fill="${VERMIL}" text-anchor="middle">2</text>
</svg>`
  );
}

async function emit(size: number, filename: string, maskable = false) {
  const dest = path.join(ICONS_DIR, filename);
  await sharp(buildSvg(size, maskable), { density: 192 })
    .resize(size, size)
    .png()
    .toFile(dest);
  console.log(`  ✓ ${filename}`);
}

async function main() {
  console.log("Generating SqFt PWA icons…");
  await emit(192, "icon-192.png");
  await emit(512, "icon-512.png");
  await emit(512, "icon-maskable-512.png", true);
  await emit(180, "apple-touch-icon.png");
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
