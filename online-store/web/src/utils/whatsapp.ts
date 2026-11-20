/**
 * Builds a valid Egyptian WhatsApp deep-link (`https://wa.me/20...`).
 * Handles all common formats:
 *   01097782965   -> 201097782965
 *   +201097782965 -> 201097782965
 *   00201097782965 -> 201097782965
 *   201097782965  -> 201097782965
 *   1097782965    -> 201097782965
 */
export function normalizeEgyptWhatsAppDigits(rawPhone: string): string {
  const digits = (rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0020')) return digits.slice(2);
  if (digits.startsWith('20') && digits.length >= 12) return digits;
  if (digits.startsWith('0')) return `20${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('1')) return `20${digits}`;
  return digits;
}

export function buildWhatsAppUrl(rawPhone: string, message?: string): string {
  const normalized = normalizeEgyptWhatsAppDigits(rawPhone);
  if (!normalized) return '#';
  const base = `https://wa.me/${normalized}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
