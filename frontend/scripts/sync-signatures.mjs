// Syncs the built-in receipt signature images from the host folder into the frontend:
//
//   desktop/Resources/signatures/*.png   (source of truth: embedded in the Windows app as RafiqPOS.signatures.<file>)
//   -> frontend/src/assets/signatures/   (mirror used by the receipt preview and the settings gallery)
//
// Every PNG in the folder joins the per-invoice rotation ("default" in the signature setting = all of them).
//
// HOW TO ADD YOUR OWN DEFAULT IMAGES
//   1. Prepare each image as a thermal-friendly PNG: black on white, white margins cropped, about 900 px wide,
//      at most 220,000 bytes and at most 1600 x 600 px. The app's own upload processing (Settings > store data > signature images,
//      src/utils/signatureImage.ts processSignatureImageFile) is the reference: upload the artwork there as root, or export a
//      grayscale PNG from any editor with the same limits. (No image library is installed here, so this script only validates.)
//   2. Drop the PNGs into desktop/Resources/signatures/ with plain ASCII names (letters, digits, dot, dash, underscore),
//      e.g. default_02.png. Files are ordered by name (ordinal), so the order is the same in the app and in the preview.
//   3. Run `npm run sync:signatures` in this folder (it also runs automatically before `npm run dev` and `npm run build`).
//   4. Rebuild the C# project on Windows (the PNGs are embedded resources) and rebuild the frontend (`npm run build`).
//
// Exit code 1 with a clear message when the source folder has no PNG, a file is not a real PNG (signature + IHDR, more than
// 8 bytes), is larger than 220,000 bytes, is wider than 1600 px or taller than 600 px, or has an unsafe file name.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SOURCE_DIR = path.resolve(here, '..', '..', 'desktop', 'Resources', 'signatures');
export const DEST_DIR = path.resolve(here, '..', 'src', 'assets', 'signatures');

// The same limits the host enforces for custom images (SettingsService.MaxSignatureImage*)
export const MAX_BYTES = 220000;
export const MAX_WIDTH = 1600;
export const MAX_HEIGHT = 600;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SAFE_NAME = /^[A-Za-z0-9._-]+\.png$/;

/** Returns a list of problems (empty = the file is acceptable). */
export function validateSignaturePng(name, bytes) {
  const problems = [];
  if (!SAFE_NAME.test(name)) problems.push(`${name}: use only letters, digits, dot, dash and underscore in the file name (ending in .png)`);
  if (bytes.length <= 8 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) {
    problems.push(`${name}: not a PNG file`);
    return problems;
  }
  if (bytes.length > MAX_BYTES) problems.push(`${name}: ${bytes.length} bytes is larger than ${MAX_BYTES}`);
  if (bytes.length < 24 || bytes.toString('latin1', 12, 16) !== 'IHDR') {
    problems.push(`${name}: the PNG header (IHDR) is missing`);
    return problems;
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1 || width > MAX_WIDTH || height > MAX_HEIGHT) {
    problems.push(`${name}: ${width}x${height} px is outside 1x1 .. ${MAX_WIDTH}x${MAX_HEIGHT}`);
  }
  return problems;
}

function pngNames(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png')).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Mirrors every PNG of source into dest and removes the extras. Returns { copied, unchanged, removed } or throws an Error with the reason. */
export function syncSignatures(source = SOURCE_DIR, dest = DEST_DIR) {
  const names = pngNames(source);
  if (names.length === 0) throw new Error(`No PNG found in ${source}. Put at least one signature image there (see the header of this script).`);

  const problems = [];
  for (const name of names) problems.push(...validateSignaturePng(name, fs.readFileSync(path.join(source, name))));
  if (problems.length > 0) throw new Error(`Signature images rejected:\n  - ${problems.join('\n  - ')}`);

  fs.mkdirSync(dest, { recursive: true });
  const result = { copied: [], unchanged: [], removed: [] };
  for (const name of names) {
    const bytes = fs.readFileSync(path.join(source, name));
    const target = path.join(dest, name);
    if (fs.existsSync(target) && fs.readFileSync(target).equals(bytes)) {
      result.unchanged.push(name);
    } else {
      fs.writeFileSync(target, bytes);
      result.copied.push(name);
    }
  }
  for (const name of pngNames(dest)) {
    if (!names.includes(name)) {
      fs.unlinkSync(path.join(dest, name));
      result.removed.push(name);
    }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { copied, unchanged, removed } = syncSignatures();
    console.log(`sync:signatures  ${copied.length} copied, ${unchanged.length} unchanged, ${removed.length} removed`);
    for (const name of copied) console.log(`  + ${name}`);
    for (const name of removed) console.log(`  - ${name}`);
    console.log(`  built-in set (${copied.length + unchanged.length}): ${[...copied, ...unchanged].sort().join(', ')}`);
  } catch (err) {
    console.error(`sync:signatures failed: ${err.message}`);
    process.exit(1);
  }
}
