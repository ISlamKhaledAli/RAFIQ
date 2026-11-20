import type { Env, Store } from '../types.ts';
import { generateUUID } from '../crypto.ts';

const MAX_IMAGE_BYTES = 500 * 1024; // 500 KB after browser WebP compression
const MAX_IMAGES_PER_PRODUCT = 3;
const ALLOWED_MIME_EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

function parseImageUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Cloud-Only Product Image Upload (Design Doc Section 3):
 * Owner uploads browser-compressed WebP/JPEG/PNG from mobile dashboard directly to
 * Cloudflare R2 (when bound) or seamlessly to Cloudflare KV (`PRODUCT_IMAGES_KV`, 1GB free / zero card).
 */
export async function handleDashboardUploadProductImage(
  request: Request,
  productId: string,
  env: Env,
  store: Store
): Promise<Response> {
  if (!env.IMAGES && !env.PRODUCT_IMAGES_KV) {
    return new Response(
      JSON.stringify({
        error: 'تخزين الصور السحابي غير مفعل بعد في إعدادات الخادم.',
        code: 'IMAGE_STORAGE_NOT_CONFIGURED',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const product = await env.DB.prepare(
    'SELECT id, image_urls FROM products WHERE id = ? AND store_id = ?'
  )
    .bind(productId, store.id)
    .first<{ id: string; image_urls: string | null }>();

  if (!product) {
    return new Response(JSON.stringify({ error: 'المنتج غير موجود' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const existingUrls = parseImageUrls(product.image_urls);
  if (existingUrls.length >= MAX_IMAGES_PER_PRODUCT) {
    return new Response(
      JSON.stringify({ error: `الحد الأقصى لصور المنتج هو ${MAX_IMAGES_PER_PRODUCT} صور` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const contentTypeHeader = (request.headers.get('Content-Type') || '').toLowerCase();

  // Support direct image URL links (CDN / external image URL without burning R2/KV storage)
  if (contentTypeHeader.includes('application/json')) {
    const jsonBody = (await request.json().catch(() => ({}))) as { image_url?: string };
    const extUrl = (jsonBody?.image_url || '').trim();
    if (
      !extUrl ||
      (!extUrl.startsWith('http://') && !extUrl.startsWith('https://') && !extUrl.startsWith('data:image/'))
    ) {
      return new Response(
        JSON.stringify({ error: 'يرجى إدخال رابط صورة صالح يبدأ بـ https:// أو http://' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const updatedUrls = [...existingUrls, extUrl];
    const now = new Date().toISOString();
    await env.DB.prepare(
      'UPDATE products SET image_urls = ?, updated_at = ? WHERE id = ? AND store_id = ?'
    )
      .bind(JSON.stringify(updatedUrls), now, productId, store.id)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        url: extUrl,
        image_urls: updatedUrls,
        storage: 'external',
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let fileBytes: ArrayBuffer;
  let mimeType = '';

  if (contentTypeHeader.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file') as unknown as File | null;
    if (!file || typeof (file as any).arrayBuffer !== 'function') {
      return new Response(JSON.stringify({ error: 'ملف الصورة مطلوب' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    mimeType = (file.type || '').toLowerCase();
    fileBytes = await file.arrayBuffer();
  } else {
    mimeType = contentTypeHeader.split(';')[0].trim();
    fileBytes = await request.arrayBuffer();
  }

  const ext = ALLOWED_MIME_EXT[mimeType];
  if (!ext) {
    return new Response(
      JSON.stringify({ error: 'صيغة الصورة غير مدعومة. الصيغ المقبولة: WebP, JPEG, PNG' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (fileBytes.byteLength === 0 || fileBytes.byteLength > MAX_IMAGE_BYTES) {
    return new Response(
      JSON.stringify({ error: 'حجم الصورة يجب أن يكون أقل من 500 كيلوبايت بعد الضغط' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const objectKey = `stores/${store.id}/products/${productId}/${generateUUID()}.${ext}`;
  let storageBackend: 'r2' | 'kv' = 'kv';

  if (env.IMAGES) {
    await env.IMAGES.put(objectKey, fileBytes, {
      httpMetadata: {
        contentType: mimeType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
    storageBackend = 'r2';
  } else if (env.PRODUCT_IMAGES_KV) {
    await env.PRODUCT_IMAGES_KV.put(objectKey, fileBytes, {
      metadata: { contentType: mimeType },
    });
    storageBackend = 'kv';
  }

  const origin = new URL(request.url).origin;
  const publicUrl = `${origin}/api/v1/images/${objectKey}`;
  const updatedUrls = [...existingUrls, publicUrl];
  const now = new Date().toISOString();

  await env.DB.prepare(
    'UPDATE products SET image_urls = ?, updated_at = ? WHERE id = ? AND store_id = ?'
  )
    .bind(JSON.stringify(updatedUrls), now, productId, store.id)
    .run();

  return new Response(
    JSON.stringify({
      success: true,
      url: publicUrl,
      image_urls: updatedUrls,
      storage: storageBackend,
    }),
    { status: 201, headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * Deletes a single product image from R2/KV (with strict tenant prefix guard) and removes it from D1.
 */
export async function handleDashboardDeleteProductImage(
  request: Request,
  productId: string,
  env: Env,
  store: Store
): Promise<Response> {
  const body = (await request.json()) as { url?: string };
  const targetUrl = (body?.url || '').trim();

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'رابط الصورة مطلوب' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const product = await env.DB.prepare(
    'SELECT id, image_urls FROM products WHERE id = ? AND store_id = ?'
  )
    .bind(productId, store.id)
    .first<{ id: string; image_urls: string | null }>();

  if (!product) {
    return new Response(JSON.stringify({ error: 'المنتج غير موجود' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const existingUrls = parseImageUrls(product.image_urls);
  const updatedUrls = existingUrls.filter((u) => u !== targetUrl);

  // Delete object from storage only if key belongs strictly to this store
  const marker = '/api/v1/images/';
  const markerIdx = targetUrl.indexOf(marker);
  if (markerIdx >= 0) {
    const objectKey = targetUrl.slice(markerIdx + marker.length);
    if (objectKey.startsWith(`stores/${store.id}/`)) {
      if (env.IMAGES) {
        try {
          await env.IMAGES.delete(objectKey);
        } catch {
          // non-fatal
        }
      }
      if (env.PRODUCT_IMAGES_KV) {
        try {
          await env.PRODUCT_IMAGES_KV.delete(objectKey);
        } catch {
          // non-fatal
        }
      }
    }
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE products SET image_urls = ?, updated_at = ? WHERE id = ? AND store_id = ?'
  )
    .bind(updatedUrls.length > 0 ? JSON.stringify(updatedUrls) : null, now, productId, store.id)
    .run();

  return new Response(
    JSON.stringify({ success: true, image_urls: updatedUrls }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * Serves a public product image from Cloudflare R2 or KV with immutable CDN caching.
 */
export async function handleServePublicImage(
  objectKey: string,
  env: Env
): Promise<Response> {
  if ((!env.IMAGES && !env.PRODUCT_IMAGES_KV) || !objectKey || !objectKey.startsWith('stores/') || objectKey.includes('..')) {
    return new Response(JSON.stringify({ error: 'Image not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (env.IMAGES) {
    const obj = await env.IMAGES.get(objectKey);
    if (obj) {
      const headers = new Headers();
      headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/webp');
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      return new Response(obj.body, { status: 200, headers });
    }
  }

  if (env.PRODUCT_IMAGES_KV) {
    const kvRes = await env.PRODUCT_IMAGES_KV.getWithMetadata<{ contentType?: string }>(objectKey, {
      type: 'arrayBuffer',
    });
    if (kvRes && kvRes.value) {
      const headers = new Headers();
      headers.set('Content-Type', kvRes.metadata?.contentType || 'image/webp');
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      return new Response(kvRes.value, { status: 200, headers });
    }
  }

  return new Response(JSON.stringify({ error: 'Image not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}
