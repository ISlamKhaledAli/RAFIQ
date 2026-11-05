// Receipt signature images (root only): setting developer_signature_image.
//   ''            -> the built-in set only (every PNG in desktop/Resources/signatures, mirrored in src/assets/signatures)
//   'none'        -> no image, text lines only
//   data:image/png;base64,... -> one custom image prepared by processSignatureImageFile
//   '["default","data:image/png;base64,..."]' -> up to 8 entries ("default" = the whole built-in set as ONE entry);
//   the pick pool expands "default" into every built-in image, and each invoice prints one image of the pool
// The pure helpers (list parsing, validation, pick, curve, crop and size math) have no DOM access so node tests can cover them.
// The validator mirrors SettingsService.TryValidateSignatureSetting in the host, which stays the authority.

export const SIGNATURE_IMAGE_NONE = 'none';
/** an element of the stored list that stands for the whole built-in set */
export const SIGNATURE_IMAGE_DEFAULT = 'default';
export const MAX_SIGNATURE_IMAGES = 8;
/** total length of the stored list (JSON array) */
export const SIGNATURE_IMAGE_LIST_MAX_CHARS = 900000;
export const SIGNATURE_IMAGE_PREFIX = 'data:image/png;base64,';
/** host limits (validated again on save) */
export const SIGNATURE_IMAGE_HOST_MAX_CHARS = 300000;
export const SIGNATURE_IMAGE_HOST_MAX_BYTES = 220000;
export const SIGNATURE_IMAGE_HOST_MAX_WIDTH = 1600;
export const SIGNATURE_IMAGE_HOST_MAX_HEIGHT = 600;
/** what the client produces: a smaller target than the host limit */
export const SIGNATURE_IMAGE_TARGET_MAX_CHARS = 200000;
export const SIGNATURE_IMAGE_MAX_WIDTH = 900;
export const SIGNATURE_IMAGE_RETRY_WIDTH = 700;
export const SIGNATURE_IMAGE_MAX_HEIGHT = 300;
export const SIGNATURE_IMAGE_MAX_INPUT_BYTES = 5 * 1024 * 1024;
export const SIGNATURE_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/bmp';

const ACCEPTED_TYPES: readonly string[] = SIGNATURE_IMAGE_ACCEPT.split(',');
const DARK_BELOW = 90;
const WHITE_ABOVE = 200;
/** pixels darker than this count as content when cropping the white margins */
const CONTENT_THRESHOLD = 200;
const CROP_PADDING = 4;
/** the source is first reduced so very large photos cannot exhaust memory */
const WORKING_MAX_SIDE = 2400;

function base64DecodedLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

/** One custom image: a PNG data URL inside the host limits (checked from the header only). */
function isValidSingleSignatureImage(text: string): boolean {
  if (text.length > SIGNATURE_IMAGE_HOST_MAX_CHARS || !text.startsWith(SIGNATURE_IMAGE_PREFIX)) return false;
  const base64 = text.slice(SIGNATURE_IMAGE_PREFIX.length);
  if (base64.length < 32 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return false;
  if (base64DecodedLength(base64) > SIGNATURE_IMAGE_HOST_MAX_BYTES) return false;

  let head: string;
  try {
    head = atob(base64.slice(0, 32));
  } catch {
    return false;
  }
  const bytes = Array.from(head, (ch) => ch.charCodeAt(0));
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (signature.some((b, i) => bytes[i] !== b)) return false;
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== 'IHDR') return false;
  const width = bytes[16] * 16777216 + bytes[17] * 65536 + bytes[18] * 256 + bytes[19];
  const height = bytes[20] * 16777216 + bytes[21] * 65536 + bytes[22] * 256 + bytes[23];
  return width >= 1 && height >= 1 && width <= SIGNATURE_IMAGE_HOST_MAX_WIDTH && height <= SIGNATURE_IMAGE_HOST_MAX_HEIGHT;
}

/**
 * The image list behind a developer_signature_image value, or null when the value is invalid:
 * '' = ['default'], 'none' = [], one data URL = [it], a JSON array = its elements ('default' once at most, up to 8).
 */
function parseSignatureImagesStrict(value: string): string[] | null {
  if (value === '') return [SIGNATURE_IMAGE_DEFAULT];
  if (value === SIGNATURE_IMAGE_NONE) return [];
  if (!value.startsWith('[')) return isValidSingleSignatureImage(value) ? [value] : null;
  if (value.length > SIGNATURE_IMAGE_LIST_MAX_CHARS || !value.endsWith(']')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_SIGNATURE_IMAGES) return null;
  if (!parsed.every((item): item is string => typeof item === 'string')) return null;
  if (parsed.filter((item) => item === SIGNATURE_IMAGE_DEFAULT).length > 1) return null;
  return parsed.every((item) => item === SIGNATURE_IMAGE_DEFAULT || isValidSingleSignatureImage(item)) ? parsed : null;
}

/** '' and 'none' are valid; so are one PNG data URL and a JSON array of up to 8 ('default' | PNG data URL). */
export function isValidSignatureImageValue(value: string | null | undefined): boolean {
  return parseSignatureImagesStrict(value ?? '') !== null;
}

/** The entries behind a stored value: 'default' stands for the whole built-in set; an invalid value gives []. */
export function parseSignatureImages(value: string | null | undefined): string[] {
  return parseSignatureImagesStrict(value ?? '') ?? [];
}

/** The stored form of a list: ['default'] -> '', [] -> 'none', one custom image -> the data URL itself, else a JSON array. */
export function serializeSignatureImages(list: readonly string[]): string {
  if (list.length === 0) return SIGNATURE_IMAGE_NONE;
  if (list.length === 1) return list[0] === SIGNATURE_IMAGE_DEFAULT ? '' : list[0];
  return JSON.stringify(list);
}

/**
 * Which image an invoice prints: FNV-1a 32-bit over the UTF-16 code units of the key, modulo the count, so the preview, the
 * thermal print and a reprint of the same invoice always agree. Twin of SettingsService.PickSignatureImageIndex.
 * count <= 0 gives -1; an empty key gives 0.
 */
export function pickSignatureImageIndex(key: string, count: number): number {
  if (count <= 0) return -1;
  if (key === '') return 0;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619) >>> 0;
  }
  return hash % count;
}

/**
 * The images an invoice can print: the stored entries with every "default" expanded into all built-in images (in order)
 * and each custom image as is. builtIns are the URLs of the built-in set (src/utils/signatureDefaults.ts).
 */
export function signatureImagePool(value: string | null | undefined, builtIns: readonly string[]): string[] {
  return parseSignatureImages(value).flatMap((item) => (item === SIGNATURE_IMAGE_DEFAULT ? [...builtIns] : [item]));
}

/**
 * What the receipt shows for an invoice: one image of the pool picked by the invoice id, or null (empty pool / invalid value).
 * forcedIndex (a pool index) lets the settings preview show a chosen image instead of the invoice's own pick.
 */
export function resolveSignatureImageSrc(
  value: string | null | undefined,
  pickKey: string,
  builtIns: readonly string[],
  forcedIndex?: number | null,
): string | null {
  const pool = signatureImagePool(value, builtIns);
  if (pool.length === 0) return null;
  const index = forcedIndex != null && forcedIndex >= 0 && forcedIndex < pool.length ? forcedIndex : pickSignatureImageIndex(pickKey, pool.length);
  return pool[index];
}

/** Same contrast curve as the built-in images: dark -> black, light -> white, linear in between. */
export function signatureCurve(value: number): number {
  if (value < DARK_BELOW) return 0;
  if (value > WHITE_ABOVE) return 255;
  return Math.round(((value - DARK_BELOW) * 255) / (WHITE_ABOVE - DARK_BELOW));
}

/** Luminance of an RGBA pixel composited on white (transparent becomes white). */
export function whiteCompositeLuma(r: number, g: number, b: number, a: number): number {
  const alpha = a / 255;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return Math.round(luma * alpha + 255 * (1 - alpha));
}

export interface ContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bounding box of the pixels darker than the threshold plus a small padding, or null when the image is blank. */
export function findContentBounds(
  gray: ArrayLike<number>,
  width: number,
  height: number,
  threshold = CONTENT_THRESHOLD,
  padding = CROP_PADDING,
): ContentBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (gray[y * width + x] < threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  return { x, y, width: Math.min(width, maxX + padding + 1) - x, height: Math.min(height, maxY + padding + 1) - y };
}

/** Final size: never upscaled, width <= maxWidth and height <= maxHeight, aspect ratio kept. */
export function fitSignatureSize(
  width: number,
  height: number,
  maxWidth = SIGNATURE_IMAGE_MAX_WIDTH,
  maxHeight = SIGNATURE_IMAGE_MAX_HEIGHT,
): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// ---------------------------------------------------------------------------
// DOM part: file -> processed PNG data URL
// ---------------------------------------------------------------------------

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('الملف المختار ليس صورة صالحة.'));
      img.onload = () => resolve(img);
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function createCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('المتصفح لا يدعم معالجة الصور.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

function encodeAtWidth(
  source: HTMLCanvasElement,
  bounds: ContentBounds,
  maxWidth: number,
): string {
  const size = fitSignatureSize(bounds.width, bounds.height, maxWidth);
  const { canvas, ctx } = createCanvas(size.width, size.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, size.width, size.height);
  const out = ctx.getImageData(0, 0, size.width, size.height);
  const data = out.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = signatureCurve(whiteCompositeLuma(data[i], data[i + 1], data[i + 2], data[i + 3]));
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Prepares a picked file for the thermal printer: white background, white margins cropped, at most 900x300 (never upscaled),
 * grayscale with the banner contrast curve, exported as PNG. Rejects with an Arabic message when the file cannot be used.
 */
export async function processSignatureImageFile(file: File): Promise<string> {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error('الملف المختار ليس صورة. اختر ملف PNG أو JPG أو WebP أو GIF أو BMP.');
  if (file.size > SIGNATURE_IMAGE_MAX_INPUT_BYTES) throw new Error('حجم الصورة أكبر من 5 ميجا. اختر صورة أصغر.');

  const img = await loadImage(file);
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  if (naturalW < 1 || naturalH < 1) throw new Error('الملف المختار ليس صورة صالحة.');

  const reduce = Math.min(1, WORKING_MAX_SIDE / Math.max(naturalW, naturalH));
  const workW = Math.max(1, Math.round(naturalW * reduce));
  const workH = Math.max(1, Math.round(naturalH * reduce));
  const { canvas: work, ctx } = createCanvas(workW, workH);
  ctx.drawImage(img, 0, 0, workW, workH);

  const pixels = ctx.getImageData(0, 0, workW, workH).data;
  const gray = new Uint8Array(workW * workH);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = whiteCompositeLuma(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2], pixels[i * 4 + 3]);
  }
  const bounds = findContentBounds(gray, workW, workH);
  if (!bounds) throw new Error('الصورة فارغة أو بيضاء بالكامل.');

  let url = encodeAtWidth(work, bounds, SIGNATURE_IMAGE_MAX_WIDTH);
  if (url.length > SIGNATURE_IMAGE_TARGET_MAX_CHARS) url = encodeAtWidth(work, bounds, SIGNATURE_IMAGE_RETRY_WIDTH);
  if (url.length > SIGNATURE_IMAGE_TARGET_MAX_CHARS || !isValidSignatureImageValue(url)) {
    throw new Error('الصورة معقدة وحجمها كبير بعد المعالجة. اختر صورة أبسط أو أقل تفاصيل.');
  }
  return url;
}
