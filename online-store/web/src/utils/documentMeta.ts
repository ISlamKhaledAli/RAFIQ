/**
 * Dynamic Browser Tab Title & Favicon Manager
 * Automatically updates <title>, <link rel="icon">, <link rel="apple-touch-icon">,
 * and <meta name="theme-color"> per store slug, logo, and active theme.
 */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeHexColor(hex: string | undefined, fallback: string): string {
  if (!hex) return fallback;
  const trimmed = hex.trim();
  return /^#[0-9a-fA-F]{3,6}$/.test(trimmed) ? trimmed : fallback;
}

export function buildMonogramFaviconDataUri(
  storeName: string,
  primaryColor = '#004D3F',
  secondaryColor = '#006D41'
): string {
  const firstChar = (storeName || 'ر').trim().charAt(0) || 'ر';
  const c1 = sanitizeHexColor(primaryColor, '#004D3F');
  const c2 = sanitizeHexColor(secondaryColor, '#006D41');
  const safeLetter = escapeXml(firstChar);

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
    `<stop offset="0%" stop-color="${c1}"/>`,
    `<stop offset="100%" stop-color="${c2}"/>`,
    '</linearGradient></defs>',
    '<rect width="64" height="64" rx="16" fill="url(#g)"/>',
    '<rect x="2" y="2" width="60" height="60" rx="14" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>',
    `<text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#FFFFFF" font-family="Cairo, Tahoma, Arial, sans-serif" font-weight="900" font-size="34">${safeLetter}</text>`,
    '</svg>',
  ].join('');

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function upsertLinkTag(rel: string, href: string, type?: string) {
  if (typeof document === 'undefined') return;
  const head = document.head;
  if (!head) return;

  const links = head.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (links.length > 0) {
    links.forEach(link => {
      link.href = href;
      if (type) {
        link.type = type;
      } else {
        link.removeAttribute('type');
      }
    });
  } else {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    if (type) {
      link.type = type;
    }
    head.appendChild(link);
  }
}

function upsertMetaTag(name: string, content: string) {
  if (typeof document === 'undefined') return;
  const head = document.head;
  if (!head) return;

  let meta = head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = name;
    head.appendChild(meta);
  }
  meta.content = content;
}

export interface DocumentBrandingOptions {
  title: string;
  description?: string;
  faviconHref: string;
  appleTouchIconHref?: string;
  themeColor?: string;
}

export function applyDocumentBranding(options: DocumentBrandingOptions): void {
  if (typeof document === 'undefined') return;

  document.title = options.title;

  if (options.description) {
    upsertMetaTag('description', options.description);
  }
  if (options.themeColor) {
    upsertMetaTag('theme-color', options.themeColor);
  }

  const isSvg = options.faviconHref.startsWith('data:image/svg+xml');
  const iconType = isSvg
    ? 'image/svg+xml'
    : options.faviconHref.endsWith('.ico')
    ? 'image/x-icon'
    : 'image/png';

  upsertLinkTag('icon', options.faviconHref, iconType);
  upsertLinkTag('shortcut icon', options.faviconHref, iconType);
  upsertLinkTag('apple-touch-icon', options.appleTouchIconHref || options.faviconHref);
}
