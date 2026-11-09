import React from 'react';
import { AppButton } from '../AppButton';
import { CheckCircle2, Plus, Smartphone, Wallet } from 'lucide-react';
import type { DigitalAccount } from '../../types/models';
import {
  digitalProviderLabel,
  isNumericAccountValue,
  rawAccountValue,
  receivingNumbers,
} from '../../utils/digitalAccounts';
import { formatPhoneDisplay } from '../../utils/phoneFormat';

export interface ReceivingAccountCardProps {
  /** The account the host will credit (see pickReceivingAccount), or null when none is set up. */
  account: DigitalAccount | null;
  /** Store-level InstaPay address / wallet number from settings, used when there is no account. */
  storeHandle: string;
  isInstapay: boolean;
  /** Only users who can manage accounts get the nudge to add the holder name. */
  canManageAccounts: boolean;
  onNavigateToWallets?: () => void;
}

interface NumberRow {
  label: string;
  display: string;
}

// The cashier reads these out loud, so every value gets the same large size; long handles step down to stay on one line
function numberSizeClass(display: string): string {
  if (display.length <= 14) return 'text-2xl leading-8';
  if (display.length <= 20) return 'text-xl leading-7';
  return 'text-base leading-6';
}

function rowLabel(raw: string, isInstapay: boolean): string {
  if (!isNumericAccountValue(raw)) return 'عنوان إنستاباي';
  return isInstapay ? 'رقم الهاتف' : 'رقم المحفظة';
}

export const ReceivingAccountCard: React.FC<ReceivingAccountCardProps> = ({
  account,
  storeHandle,
  isInstapay,
  canManageAccounts,
  onNavigateToWallets,
}) => {
  const numbers = account ? receivingNumbers(account) : null;
  const storeRaw = rawAccountValue(storeHandle);

  // InstaPay shows the payment address and the phone with equal weight; a wallet shows its number
  const rows: NumberRow[] = [];
  if (account && numbers) {
    if (numbers.primary) rows.push({ label: rowLabel(numbers.primary, isInstapay), display: formatPhoneDisplay(numbers.primary) });
    if (numbers.secondary) rows.push({ label: rowLabel(numbers.secondary, isInstapay), display: formatPhoneDisplay(numbers.secondary) });
  } else if (storeRaw) {
    rows.push({ label: rowLabel(storeRaw, isInstapay), display: formatPhoneDisplay(storeRaw) });
  }

  const holderName = (account?.holderName ?? '').trim();
  const accountLabel = (account?.name ?? '').trim();
  const MethodIcon = isInstapay ? Smartphone : Wallet;
  const hasAnything = Boolean(account) || rows.length > 0;

  const numberRows = rows.length > 0 ? (
    <div className="flex flex-col gap-2 min-w-0">
      {rows.map((row) => (
        <div
          key={row.label + row.display}
          className="rounded-xl border-2 border-brand/40 dark:border-brand-bright/50 bg-surface dark:bg-surface-dark px-3 py-1.5 flex items-center justify-between gap-3 min-w-0"
        >
          <span className="shrink-0 text-xs font-bold text-ink-muted dark:text-ink-dark-muted">{row.label}</span>
          <span
            dir="ltr"
            className={`min-w-0 text-left ${numberSizeClass(row.display)} font-mono font-black tabular-nums text-ink dark:text-ink-dark break-all select-all`}
            data-testid="receiving-number"
          >
            {row.display}
          </span>
        </div>
      ))}
    </div>
  ) : null;

  return (
    <div
      className="rounded-2xl border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 p-3.5 min-h-[11.75rem] flex-1 flex flex-col gap-2 min-w-0"
      data-testid="receiving-account-card"
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 text-sm font-bold text-ink dark:text-ink-dark min-w-0">
          {hasAnything ? (
            <CheckCircle2 className="w-5 h-5 text-paid dark:text-paid-bright shrink-0" />
          ) : (
            <MethodIcon className="w-5 h-5 text-brand dark:text-brand-bright shrink-0" />
          )}
          <span className="min-w-0 truncate">
            {account
              ? 'الحساب المستلم'
              : rows.length > 0
                ? isInstapay
                  ? 'عنوان إنستاباي للمحل'
                  : 'رقم محفظة المحل'
                : `تحويل مباشر على ${isInstapay ? 'إنستاباي' : 'المحفظة'}`}
          </span>
        </div>
        {account && (
          <span className="shrink-0 max-w-[60%] truncate text-micro font-bold px-2.5 py-0.5 rounded-full border border-brand/40 dark:border-brand-bright/50 bg-brand-soft dark:bg-brand-dark-soft text-brand-dark dark:text-brand-bright">
            {digitalProviderLabel(account)}
          </span>
        )}
      </div>

      {account ? (
        <>
          {holderName ? (
            <div className="min-w-0">
              <span className="block text-micro font-bold text-ink-muted dark:text-ink-dark-muted">اسم صاحب الحساب</span>
              <span
                className={`block ${holderName.length > 28 ? 'text-base' : 'text-xl'} font-black leading-snug text-brand dark:text-brand-bright break-words line-clamp-2 select-text`}
                title={holderName}
                data-testid="receiving-holder-name"
              >
                {holderName}
              </span>
            </div>
          ) : (
            <div className="min-w-0">
              {accountLabel && (
                <span className="block text-base font-black leading-snug text-brand dark:text-brand-bright break-words line-clamp-1" title={accountLabel}>
                  {accountLabel}
                </span>
              )}
              {canManageAccounts && (
                <p className="m-0 text-xs text-ink-muted dark:text-ink-dark-muted leading-relaxed">
                  أضف اسم صاحب الحساب من شاشة المحافظ ليظهر هنا
                </p>
              )}
            </div>
          )}

          {numberRows ?? (
            <p className="m-0 text-sm text-ink-muted dark:text-ink-dark-muted">لا يوجد رقم أو عنوان مسجل لهذا الحساب.</p>
          )}
        </>
      ) : rows.length > 0 ? (
        <div className="flex-1 min-w-0 flex flex-col justify-center">{numberRows}</div>
      ) : (
        <>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <p className="text-sm text-ink-muted dark:text-ink-dark-muted m-0 leading-relaxed">
              اطلب من الزبون إتمام التحويل إلى {isInstapay ? 'حساب إنستاباي' : 'محفظة كاش'} التابع للمحل.
            </p>
          </div>
          {onNavigateToWallets && (
            <div className="min-h-11 flex items-center">
              <AppButton variant="secondary" size="lg" icon={Plus} onClick={onNavigateToWallets}>
                ربط حساب بمكتب المحافظ
              </AppButton>
            </div>
          )}
        </>
      )}
    </div>
  );
};
