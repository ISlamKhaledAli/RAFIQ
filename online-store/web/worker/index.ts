interface AssetsFetcher {
  fetch(request: Request | string): Promise<Response>;
}

interface Env {
  ASSETS: AssetsFetcher;
  STORE_API_BASE?: string;
}

interface StoreMetaRecord {
  name?: string;
  slug?: string;
  welcome_message?: string | null;
  address?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  theme_preset?: string | null;
}

interface PageMeta {
  title: string;
  description: string;
  siteName: string;
  ogImage: string;
  faviconHref: string;
  faviconType: string;
  appleTouchIconHref: string;
  themeColor: string;
  canonicalUrl: string;
  robots?: string;
}

const VALID_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

const THEME_COLOR_MAP: Record<string, { primary: string; secondary: string }> = {
  // 12 Curated Flagship WCAG-AA Themes
  'rafiq-official': { primary: '#004D3F', secondary: '#006D41' },
  'royal-navy-gold': { primary: '#0F1F4B', secondary: '#1E3A8A' },
  'obsidian-gold': { primary: '#111827', secondary: '#92400E' },
  'fresh-market': { primary: '#166534', secondary: '#15803D' },
  'olive-harvest': { primary: '#2D4A22', secondary: '#3F6212' },
  'med-care-teal': { primary: '#0F4C5C', secondary: '#0E7490' },
  'ocean-trust': { primary: '#0B3954', secondary: '#0369A1' },
  'espresso-roast': { primary: '#4A2511', secondary: '#7C2D12' },
  'crimson-grill': { primary: '#991B1B', secondary: '#C2410C' },
  'berry-patisserie': { primary: '#831843', secondary: '#BE185D' },
  'velvet-plum': { primary: '#4C1D95', secondary: '#6B21A8' },
  'modern-slate-indigo': { primary: '#1E1B4B', secondary: '#3730A3' },
  // Legacy Key Mappings
  'classic-green': { primary: '#004D3F', secondary: '#006D41' },
  'duo-forest-cream': { primary: '#004D3F', secondary: '#006D41' },
  'duo-pine-chartreuse': { primary: '#166534', secondary: '#15803D' },
  'mat-market-quad': { primary: '#166534', secondary: '#15803D' },
  'duo-midnight-gold': { primary: '#0F1F4B', secondary: '#1E3A8A' },
  'duo-royal-mustard': { primary: '#0F1F4B', secondary: '#1E3A8A' },
  'mat-luxury-gold': { primary: '#111827', secondary: '#92400E' },
  'elegant-dark': { primary: '#111827', secondary: '#92400E' },
  'duo-ocean-mint': { primary: '#0B3954', secondary: '#0369A1' },
  'medical-blue': { primary: '#0F4C5C', secondary: '#0E7490' },
  'mat-medical-mint': { primary: '#0F4C5C', secondary: '#0E7490' },
  'teal-fresh': { primary: '#0F4C5C', secondary: '#0E7490' },
  'mat-tech-cyan': { primary: '#1E1B4B', secondary: '#3730A3' },
  'cyan-tech': { primary: '#1E1B4B', secondary: '#3730A3' },
  'duo-indigo-tangerine': { primary: '#1E1B4B', secondary: '#3730A3' },
  'mat-indigo-rose': { primary: '#1E1B4B', secondary: '#3730A3' },
  'duo-espresso-latte': { primary: '#4A2511', secondary: '#7C2D12' },
  'warm-brown': { primary: '#4A2511', secondary: '#7C2D12' },
  'mat-roastery-caramel': { primary: '#4A2511', secondary: '#7C2D12' },
  'mat-flame-grill': { primary: '#991B1B', secondary: '#C2410C' },
  'vibrant-red': { primary: '#991B1B', secondary: '#C2410C' },
  'duo-burgundy-peach': { primary: '#831843', secondary: '#BE185D' },
  'mat-sweet-bakery': { primary: '#831843', secondary: '#BE185D' },
  'amber-bakery': { primary: '#831843', secondary: '#BE185D' },
  'rose-fashion': { primary: '#831843', secondary: '#BE185D' },
  'duo-plum-sage': { primary: '#4C1D95', secondary: '#6B21A8' },
  'purple-luxury': { primary: '#4C1D95', secondary: '#6B21A8' },
};

function safeDecodeSegment(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildMonogramFaviconDataUri(storeName: string, primary: string, secondary: string): string {
  const letter = (storeName || 'ر').trim().charAt(0) || 'ر';
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
    `<stop offset="0%" stop-color="${primary}"/>`,
    `<stop offset="100%" stop-color="${secondary}"/>`,
    '</linearGradient></defs>',
    '<rect width="64" height="64" rx="16" fill="url(#g)"/>',
    '<rect x="2" y="2" width="60" height="60" rx="14" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>',
    `<text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#FFFFFF" font-family="Cairo, Tahoma, Arial, sans-serif" font-weight="900" font-size="34">${escapeXml(letter)}</text>`,
    '</svg>',
  ].join('');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function toAbsoluteUrl(maybeRelative: string | null | undefined, origin: string, fallbackPath: string): string {
  if (!maybeRelative || !maybeRelative.trim()) {
    return `${origin}${fallbackPath}`;
  }
  const trimmed = maybeRelative.trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return `${origin}${trimmed}`;
  }
  return `${origin}/${trimmed}`;
}

async function resolvePageMeta(url: URL, env: Env): Promise<PageMeta> {
  const origin = url.origin;
  const defaultIcon = `${origin}/app_icon_512.png`;

  const demoMeta: PageMeta = {
    title: 'متجر رفيق الرسمي | تسوق أونلاين',
    description:
      'المتجر التجريبي الرسمي لنظام كاشير رفيق — تصفح المنتجات، اطلب أونلاين بأسعار المحل الرسمية، وتابع طلبك لحظة بلحظة.',
    siteName: 'منصة رفيق للمتاجر الإلكترونية',
    ogImage: defaultIcon,
    faviconHref: '/app_icon_512.png',
    faviconType: 'image/png',
    appleTouchIconHref: '/app_icon_512.png',
    themeColor: '#004D3F',
    canonicalUrl: `${origin}/rafiq`,
  };

  const notFoundMeta: PageMeta = {
    title: 'المتجر غير موجود (404) | رفيق للمتاجر الإلكترونية',
    description: 'الرابط الذي حاولت الوصول إليه غير مسجل في شبكة متاجر رفيق الإلكترونية.',
    siteName: 'منصة رفيق للمتاجر الإلكترونية',
    ogImage: defaultIcon,
    faviconHref: '/app_icon_512.png',
    faviconType: 'image/png',
    appleTouchIconHref: '/app_icon_512.png',
    themeColor: '#004D3F',
    canonicalUrl: url.href,
    robots: 'noindex, nofollow',
  };

  const segments = url.pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);

  if (segments.length === 0) {
    return demoMeta;
  }

  const first = safeDecodeSegment(segments[0]).toLowerCase();
  const second = segments[1] ? safeDecodeSegment(segments[1]).toLowerCase() : '';
  const isAdminPath =
    (segments.length === 1 && (first === 'admin' || first === 'dashboard')) ||
    (segments.length === 2 && (second === 'admin' || second === 'dashboard'));

  if (segments.length > 2 || (segments.length === 2 && !isAdminPath)) {
    return notFoundMeta;
  }

  if (first === 'rafiq' || first === 'admin' || first === 'dashboard') {
    if (isAdminPath) {
      return {
        ...demoMeta,
        title: 'لوحة تحكم متجر رفيق الرسمي | رفيق',
        canonicalUrl: `${origin}/rafiq/admin`,
      };
    }
    return demoMeta;
  }

  if (!VALID_SLUG_REGEX.test(first)) {
    return notFoundMeta;
  }

  // Live lookup of tenant store metadata for WhatsApp / Social OG + Instant Tab Branding
  const apiBase = (
    env.STORE_API_BASE || 'https://rafiq-store-api.rafiqpos.workers.dev/api/v1'
  ).replace(/\/+$/, '');

  try {
    const res = await fetch(`${apiBase}/store/${encodeURIComponent(first)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2500),
    });

    if (res.status === 403) {
      return {
        title: 'المتجر غير متاح حالياً | رفيق للمتاجر الإلكترونية',
        description: 'هذا المتجر الإلكتروني غير متاح حالياً. يرجى التواصل مع إدارة المحل.',
        siteName: 'منصة رفيق للمتاجر الإلكترونية',
        ogImage: defaultIcon,
        faviconHref: '/app_icon_512.png',
        faviconType: 'image/png',
        appleTouchIconHref: '/app_icon_512.png',
        themeColor: '#004D3F',
        canonicalUrl: url.href,
        robots: 'noindex, nofollow',
      };
    }

    if (res.status === 404) {
      return notFoundMeta;
    }

    if (res.ok) {
      const payload = (await res.json()) as { store?: StoreMetaRecord };
      const store = payload?.store;
      if (store && store.name) {
        const colors = THEME_COLOR_MAP[store.theme_preset || 'rafiq-official'] || THEME_COLOR_MAP['rafiq-official'];
        const title = isAdminPath
          ? `لوحة تحكم ${store.name} | رفيق`
          : `${store.name} | اطلب أونلاين`;
        const description =
          (store.welcome_message && store.welcome_message.trim()) ||
          `تسوق الآن من ${store.name}${store.address ? ` — ${store.address}` : ''} واطلب دليفري أو استلام من الفرع بأسعار المحل الرسمية.`;

        const hasLogo = Boolean(store.logo_url && store.logo_url.trim());
        const ogImage = toAbsoluteUrl(store.banner_url || store.logo_url, origin, '/app_icon_512.png');
        const faviconHref = hasLogo
          ? store.logo_url!.trim()
          : buildMonogramFaviconDataUri(store.name, colors.primary, colors.secondary);
        const faviconType = hasLogo ? 'image/png' : 'image/svg+xml';
        const appleTouchIconHref = hasLogo ? store.logo_url!.trim() : '/app_icon_512.png';

        return {
          title,
          description,
          siteName: store.name,
          ogImage,
          faviconHref,
          faviconType,
          appleTouchIconHref,
          themeColor: colors.primary,
          canonicalUrl: `${origin}/${encodeURIComponent(first)}`,
        };
      }
    }
  } catch {
    // Non-fatal fallback: let SPA handle client-side retry
  }

  return {
    ...demoMeta,
    title: 'متجر رفيق الإلكتروني | تسوق أونلاين',
    canonicalUrl: url.href,
  };
}

function rewriteHtmlWithMeta(htmlResponse: Response, meta: PageMeta): Response {
  const rewriter = new HTMLRewriter()
    .on('title', {
      element(el) {
        el.setInnerContent(meta.title);
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute('content', meta.description);
      },
    })
    .on('meta[name="theme-color"]', {
      element(el) {
        el.setAttribute('content', meta.themeColor);
      },
    })
    .on('meta[property="og:site_name"]', {
      element(el) {
        el.setAttribute('content', meta.siteName);
      },
    })
    .on('meta[property="og:title"]', {
      element(el) {
        el.setAttribute('content', meta.title);
      },
    })
    .on('meta[property="og:description"]', {
      element(el) {
        el.setAttribute('content', meta.description);
      },
    })
    .on('meta[property="og:image"]', {
      element(el) {
        el.setAttribute('content', meta.ogImage);
      },
    })
    .on('meta[property="og:url"]', {
      element(el) {
        el.setAttribute('content', meta.canonicalUrl);
      },
    })
    .on('meta[name="twitter:title"]', {
      element(el) {
        el.setAttribute('content', meta.title);
      },
    })
    .on('meta[name="twitter:description"]', {
      element(el) {
        el.setAttribute('content', meta.description);
      },
    })
    .on('meta[name="twitter:image"]', {
      element(el) {
        el.setAttribute('content', meta.ogImage);
      },
    })
    .on('link[rel="icon"]', {
      element(el) {
        el.setAttribute('href', meta.faviconHref);
        el.setAttribute('type', meta.faviconType);
      },
    })
    .on('link[rel="shortcut icon"]', {
      element(el) {
        el.setAttribute('href', meta.faviconHref);
        el.setAttribute('type', meta.faviconType);
      },
    })
    .on('link[rel="apple-touch-icon"]', {
      element(el) {
        el.setAttribute('href', meta.appleTouchIconHref);
      },
    });

  if (meta.robots) {
    rewriter.on('head', {
      element(el) {
        el.append(`<meta name="robots" content="${meta.robots}" />`, { html: true });
      },
    });
  }

  const transformed = rewriter.transform(htmlResponse);
  const headers = new Headers(transformed.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate');

  return new Response(transformed.body, {
    status: 200,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method !== 'GET' && method !== 'HEAD') {
      return env.ASSETS.fetch(request);
    }

    // Fetch built SPA shell (index.html) from static assets binding
    const indexRequest = new Request(new URL('/index.html', url.origin).toString(), {
      method: 'GET',
      headers: request.headers,
    });
    const htmlRes = await env.ASSETS.fetch(indexRequest);

    const meta = await resolvePageMeta(url, env);
    const rewritten = rewriteHtmlWithMeta(htmlRes, meta);

    if (method === 'HEAD') {
      return new Response(null, {
        status: rewritten.status,
        headers: rewritten.headers,
      });
    }

    return rewritten;
  },
};
