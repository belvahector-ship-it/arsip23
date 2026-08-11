const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '..', 'assets', 'favicon.svg');
const outDir = path.join(__dirname, '..', 'assets', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const svg = Buffer.from(
  fs.readFileSync(svgPath, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
);

const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-48x48.png', size: 48 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
];

(async () => {
  for (const { name, size } of sizes) {
    await sharp(svg, { density: 384 })
      .resize(size, size)
      .png()
      .toFile(path.join(outDir, name));
    console.log('wrote', name);
  }

  // build a multi-size .ico (16/32/48) from the PNGs we just made
  const icoSizes = [16, 32, 48];
  const pngBuffers = await Promise.all(
    icoSizes.map((s) => fs.promises.readFile(path.join(outDir, `favicon-${s}x${s}.png`)))
  );
  const ico = buildIco(icoSizes, pngBuffers);
  fs.writeFileSync(path.join(__dirname, '..', 'assets', 'favicon.ico'), ico);
  console.log('wrote favicon.ico');
})();

function buildIco(sizes, pngBuffers) {
  const count = sizes.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  const images = [];
  for (let i = 0; i < count; i++) {
    const size = sizes[i];
    const png = pngBuffers[i];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    dirEntries.push(entry);
    images.push(png);
  }

  return Buffer.concat([header, ...dirEntries, ...images]);
}
