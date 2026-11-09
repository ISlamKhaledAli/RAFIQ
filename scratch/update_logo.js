const fs = require('fs');
const b64 = fs.readFileSync('scratch/logo_b64.txt', 'utf8').trim();

const code = `// Auto-generated Rafiq official logo asset (256x256 PNG retina)
// Concept 2 Corporate Swiss: 'R' Emblem with Barcode and Dynamic Growth Arrow
export const LOGO_BASE64 = '${b64}';

export const LOGO_DATA_URI = 'data:image/png;base64,' + LOGO_BASE64;

// Decode base64 to binary bytes once in memory
const LOGO_BYTES: Uint8Array = (() => {
  const binaryString = atob(LOGO_BASE64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
})();

export function serveLogoPng(): Response {
  return new Response(LOGO_BYTES, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
`;

fs.writeFileSync('license-server/src/views/admin/logoAsset.ts', code, 'utf8');
console.log('logoAsset.ts written successfully, bytes:', code.length);

