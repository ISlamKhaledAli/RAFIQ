export interface RafiqConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'warning' | 'danger' | 'info';
}

export interface RafiqAlertOptions {
  title?: string;
  message: string;
  confirmText?: string;
  variant?: 'warning' | 'error' | 'info' | 'success';
}

export type DialogState = {
  isOpen: boolean;
  isConfirm: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  variant: 'warning' | 'danger' | 'error' | 'info' | 'success';
  resolve?: (value: boolean) => void;
};

let dialogHandler: ((state: DialogState) => void) | null = null;
let isAnyDialogOpen = false;

export const isRafiqDialogOpen = (): boolean => isAnyDialogOpen;

export const setDialogHandler = (handler: ((state: DialogState) => void) | null) => {
  dialogHandler = handler;
  if (!handler) {
    isAnyDialogOpen = false;
  }
};

export const rafiqConfirm = (options: RafiqConfirmOptions | string): Promise<boolean> => {
  return new Promise<boolean>((resolve) => {
    const opts: RafiqConfirmOptions = typeof options === 'string' ? { message: options } : options;
    if (dialogHandler) {
      isAnyDialogOpen = true;
      dialogHandler({
        isOpen: true,
        isConfirm: true,
        title: opts.title || 'تأكيد العملية',
        message: opts.message,
        confirmText: opts.confirmText || 'تأكيد ومتابعة',
        cancelText: opts.cancelText || 'إلغاء',
        variant: opts.variant || 'warning',
        resolve: (val: boolean) => {
          isAnyDialogOpen = false;
          resolve(val);
        },
      });
    } else {
      console.warn('RafiqDialogContainer not mounted yet for confirm:', opts.message);
      resolve(true);
    }
  });
};

export const rafiqAlert = (options: RafiqAlertOptions | string): Promise<void> => {
  return new Promise<void>((resolve) => {
    const opts: RafiqAlertOptions = typeof options === 'string' ? { message: options } : options;
    if (dialogHandler) {
      isAnyDialogOpen = true;
      dialogHandler({
        isOpen: true,
        isConfirm: false,
        title: opts.title || (opts.variant === 'error' ? 'حدث خطأ' : 'تنبيه'),
        message: opts.message,
        confirmText: opts.confirmText || 'حسناً، فهمت',
        cancelText: '',
        variant: opts.variant || 'info',
        resolve: () => {
          isAnyDialogOpen = false;
          resolve();
        },
      });
    } else {
      console.warn('RafiqDialogContainer not mounted yet for alert:', opts.message);
      resolve();
    }
  });
};
