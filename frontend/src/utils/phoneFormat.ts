import { normalizeArabicDigits } from './numberEnforcer.ts';

const PHONE_SHAPE = /^\+?[\d\s\-()]+$/;

function stripCountryPrefix(text: string, digits: string): string | null {
  let rest: string;
  if (text.startsWith('+')) {
    if (!digits.startsWith('20')) return null;
    rest = digits.slice(2);
  } else if (digits.startsWith('0020')) {
    rest = digits.slice(4);
  } else {
    return digits;
  }
  rest = rest.replace(/^0/, '');
  return rest ? `0${rest}` : null;
}

function groupLocal(digits: string): string | null {
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10 && digits.startsWith('02')) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return null;
}

/**
 * Display-only phone format: 01012345678 -> 010-1234-5678, Cairo/Giza landline 0223456789 -> 02-2345-6789.
 * Accepts spaces, hyphens, parentheses, Arabic-Indic digits and a +20 / 0020 prefix (shown in local form).
 * Anything that is not a recognisable 10-11 digit number (letters, handles, other lengths) is returned as given.
 * Never use the result for storage, copying or the host: those stay raw digits.
 */
export function formatPhoneDisplay(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  const source = String(raw);
  const text = normalizeArabicDigits(source).trim();
  if (!text) return '';
  if (!PHONE_SHAPE.test(text)) return source;
  const local = stripCountryPrefix(text, text.replace(/\D/g, ''));
  return (local && groupLocal(local)) || source;
}
