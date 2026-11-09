import type { DigitalAccount, DigitalAccountType } from '../types/models';

type ReceivingCandidate = Pick<DigitalAccount, 'accountType' | 'isActive' | 'isDefault' | 'createdAt'>;

/**
 * The account a customer is told to pay into. Mirrors the host's sale credit
 * (`WHERE type = @type AND is_active = 1 ORDER BY is_default DESC, created_at ASC LIMIT 1`)
 * so the screen never names a different account than the one that receives the money.
 * Equal keys keep the incoming list order.
 */
export function pickReceivingAccount<T extends ReceivingCandidate>(
  accounts: readonly T[] | null | undefined,
  type: DigitalAccountType,
): T | null {
  if (!accounts) return null;
  let best: T | null = null;
  for (const account of accounts) {
    if (!account || account.accountType !== type || !account.isActive) continue;
    if (best === null || isBetterReceiver(account, best)) best = account;
  }
  return best;
}

function isBetterReceiver(candidate: ReceivingCandidate, current: ReceivingCandidate): boolean {
  const candidateDefault = candidate.isDefault === true;
  const currentDefault = current.isDefault === true;
  if (candidateDefault !== currentDefault) return candidateDefault;
  // Plain string comparison, exactly like SQLite's ORDER BY on the stored text; a missing date sorts first (NULL first)
  return (candidate.createdAt || '') < (current.createdAt || '');
}

/** Digits and separators only (no letters / @): a phone or card style number rather than an InstaPay handle. */
export function isNumericAccountValue(value: string): boolean {
  return /^[\d\s-]+$/.test(value.trim());
}

/** The exact text to copy: digits only for numbers (no spaces or dashes), the handle untouched otherwise. */
export function rawAccountValue(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  return isNumericAccountValue(trimmed) ? trimmed.replace(/\D/g, '') : trimmed;
}

export interface ReceivingNumbers {
  primary: string;
  secondary: string;
}

/**
 * Which value is the big one. InstaPay: the payment address first, phone second; wallets: the phone first.
 * The host aliases phone and identifier to the account number when only one was typed, so equal values collapse.
 */
export function receivingNumbers(
  account: Pick<DigitalAccount, 'accountType' | 'phoneNumber' | 'identifier'>,
): ReceivingNumbers {
  const phone = rawAccountValue(account.phoneNumber);
  const identifier = rawAccountValue(account.identifier);
  const [primary, other] = account.accountType === 'instapay' ? [identifier || phone, phone] : [phone || identifier, identifier];
  return { primary, secondary: other && other !== primary ? other : '' };
}

const WALLET_LABELS: Record<string, string> = {
  vodafone_cash: 'فودافون كاش',
  orange_cash: 'أورانج كاش',
  etisalat_cash: 'اتصالات كاش',
  we_pay: 'وي باي',
  meeza_wallet: 'ميزة كاش',
  nbe_phone_cash: 'الأهلي فون كاش',
  bm_wallet: 'محفظة بنك مصر',
  cib_smart_wallet: 'سمارت واليت CIB',
  bdc_qahera_cash: 'قاهرة كاش',
  alex_wallet: 'محفظة إسكندرية',
  qnb_wallet: 'محفظة QNB',
  other: 'محفظة أخرى',
};

const BANK_LABELS: Record<string, string> = {
  nbe: 'الأهلي المصري',
  bm: 'بنك مصر',
  cib: 'CIB',
  bdc: 'بنك القاهرة',
  alex: 'بنك الإسكندرية',
  qnb: 'QNB الأهلي',
  aaib: 'العربي الأفريقي',
  faisal: 'فيصل الإسلامي',
  adib: 'أبوظبي الإسلامي',
  hdb: 'التعمير والإسكان',
  united: 'المصرف المتحد',
  adcb: 'أبوظبي التجاري',
  baraka: 'بنك البركة',
  saib: 'بنك saib',
  ebank: 'تنمية الصادرات',
  scb: 'قناة السويس',
  nbk: 'الكويت الوطني',
  enbd: 'الإمارات دبي',
  fab: 'أبوظبي الأول',
  ca: 'كريدي أجريكول',
  hsbc: 'HSBC مصر',
  abk: 'الأهلي الكويتي',
  aib: 'الاستثمار العربي',
  arabbank: 'البنك العربي',
  post: 'البريد المصري',
  meeza_card: 'كارت ميزة',
  other_bank: 'حساب بنكي',
};

/** Short provider chip text: 'فودافون كاش' for wallets, 'إنستاباي • الأهلي المصري' (or just 'إنستاباي') for InstaPay. */
export function digitalProviderLabel(account: Pick<DigitalAccount, 'accountType' | 'provider'>): string {
  if (account.accountType === 'instapay') {
    const code = String(account.provider || '').replace(/^instapay_/, '');
    const bank = BANK_LABELS[code];
    return bank ? `إنستاباي • ${bank}` : 'إنستاباي';
  }
  return WALLET_LABELS[account.provider] || 'محفظة كاش';
}
