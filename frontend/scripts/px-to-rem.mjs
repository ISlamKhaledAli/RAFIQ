// Converts fixed pixel size utilities to exact rem equivalents (px / 16) so boxes grow together with their text when the
// personal text size (utils/textScale.ts, root font-size) changes. At the default size the result is pixel identical.
//
//   node scripts/px-to-rem.mjs           dry run: reports every file and token count
//   node scripts/px-to-rem.mjs --write   applies the conversion (CRLF/LF preserved, idempotent)
//   node scripts/px-to-rem.mjs --check   exit code 1 while any convertible pixel class is left outside the allow-list
//
// Converted: h-/min-h-/max-h-/w-/min-w-/max-w-[Npx] (with any variant prefix) and the px parts of grid-cols-/grid-rows-[...].
// Not converted: hairlines (3px or less), print: variants (print keeps a 100% root font so px and rem match there),
// text-[Npx] (only used for print; index.css print-compact selectors match the literal class), borders, radii, shadows,
// blur and everything listed in PX_ALLOW_LIST.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SRC_DIR = path.resolve(here, '..', 'src');

// Intentionally fixed sizes. Key: path relative to src/ with forward slashes; each token must carry a reason.
export const PX_ALLOW_LIST = {
  'App.tsx': [
    { token: 'w-[256px]', reason: 'sidebar width: the layout shell keeps a fixed width so the content area is predictable' },
    { token: 'w-[64px]', reason: 'collapsed sidebar rail width' },
  ],
  'components/ReceiptPaper.tsx': [
    { token: 'w-[220px]', reason: '57mm receipt paper preview width' },
    { token: 'w-[302px]', reason: '80mm receipt paper preview width' },
    { token: 'max-h-[48px]', reason: 'store logo printed on the receipt: image size, not text' },
    { token: 'max-w-[90px]', reason: 'store logo printed on the receipt (57mm paper)' },
    { token: 'max-w-[130px]', reason: 'store logo printed on the receipt (80mm paper)' },
  ],
  'components/RecoveryCodeModal.tsx': [
    { token: 'w-[220px]', reason: '57mm recovery-code slip preview width' },
    { token: 'w-[310px]', reason: '80mm recovery-code slip preview width' },
    { token: 'max-h-[48px]', reason: 'store logo printed on the slip: image size, not text' },
    { token: 'max-w-[90px]', reason: 'store logo printed on the slip (57mm paper)' },
    { token: 'max-w-[130px]', reason: 'store logo printed on the slip (80mm paper)' },
    { token: 'max-w-[280px]', reason: 'barcode image on the slip: image size, not text' },
  ],
  'views/customers/CustomerPrintStatementModal.tsx': [
    { token: 'w-[219px]', reason: '57mm thermal statement paper width' },
    { token: 'w-[320px]', reason: '80mm thermal statement paper width' },
  ],
  'views/customers/CustomerReceiptVoucherModal.tsx': [
    { token: 'w-[320px]', reason: '80mm thermal voucher paper width' },
  ],
  'components/DosageLabelModal.tsx': [
    { token: 'max-w-[310px]', reason: 'dosage label preview: physical label width' },
  ],
  'views/SalesHistoryView.tsx': [
    { token: 'min-w-[220px]', reason: 'file owned by another change set while this sweep ran: convert with --write once it lands' },
  ],
};

const HAIRLINE_MAX_PX = 3;
const SIZE_CLASS = /(?<![\w[\]-])((?:[a-z0-9-]+:)*(?:(?:min|max)-)?(?:h|w)-)\[(\d+(?:\.\d+)?)px\](?![\w\]-])/g;
const GRID_CLASS = /(?<![\w[\]-])((?:[a-z0-9-]+:)*grid-(?:cols|rows)-)\[([^\]\s]*\d+px[^\]\s]*)\]/g;

export function pxToRem(px) {
  return `${Number(px) / 16}rem`;
}

/** Returns the converted source plus the tokens converted and skipped (allow-listed), in order of appearance. */
export function convertSource(source, allow = []) {
  const converted = [];
  const skipped = [];
  const swap = (prefix, value, whole) => {
    const token = `${prefix}[${value}px]`;
    if (allow.includes(token) || Number(value) <= HAIRLINE_MAX_PX || /(^|:)print:/.test(prefix)) {
      skipped.push(token);
      return whole;
    }
    converted.push(token);
    return `${prefix}[${pxToRem(value)}]`;
  };
  let text = source.replace(SIZE_CLASS, (whole, prefix, value) => swap(prefix, value, whole));
  text = text.replace(GRID_CLASS, (whole, prefix, body) => {
    converted.push(`${prefix}[${body}]`);
    return `${prefix}[${body.replace(/(\d+(?:\.\d+)?)px/g, (_m, n) => pxToRem(n))}]`;
  });
  return { text, converted, skipped };
}

export function listSourceFiles(dir = SRC_DIR) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(full));
    else if (/\.(tsx?|css)$/.test(entry.name)) files.push(full);
  }
  return files.sort();
}

export function allowedTokens(relPath) {
  return (PX_ALLOW_LIST[relPath] || []).map((a) => a.token);
}

export function convertProject({ write = false, dir = SRC_DIR } = {}) {
  const report = [];
  for (const file of listSourceFiles(dir)) {
    const rel = path.relative(dir, file).split(path.sep).join('/');
    const source = fs.readFileSync(file, 'utf8');
    const { text, converted, skipped } = convertSource(source, allowedTokens(rel));
    if (converted.length === 0) continue;
    if (write && text !== source) fs.writeFileSync(file, text);
    report.push({ file: rel, count: converted.length, skipped: skipped.length, tokens: converted });
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const write = process.argv.includes('--write');
  const check = process.argv.includes('--check');
  const report = convertProject({ write });
  let total = 0;
  for (const { file, count, tokens } of report) {
    total += count;
    const summary = Object.entries(tokens.reduce((acc, t) => ({ ...acc, [t]: (acc[t] || 0) + 1 }), {}))
      .map(([t, n]) => `${t} x${n}`)
      .join(', ');
    console.log(`${String(count).padStart(4)}  ${file}  ${summary}`);
  }
  console.log(`${write ? 'converted' : 'convertible'}: ${total} classes in ${report.length} files`);
  if (check && total > 0) process.exit(1);
}
