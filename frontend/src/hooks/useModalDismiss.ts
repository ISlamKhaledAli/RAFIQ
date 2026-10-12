import { useEffect, useCallback, useRef } from 'react';
import type React from 'react';
import { rafiqConfirm, isRafiqDialogOpen } from '../utils/dialogService';

export interface UseModalDismissOptions {
  isOpen: boolean;
  onClose?: () => void;
  onDismiss?: () => void;
  /**
   * Boolean or function returning boolean indicating whether the modal has unsaved changes.
   */
  isDirty?: boolean | (() => boolean);
  /**
   * Confirmation title when unsaved changes exist
   */
  confirmTitle?: string;
  /**
   * Confirmation message when unsaved changes exist
   */
  confirmMessage?: string;
  /**
   * Confirm button text to proceed with discarding changes
   */
  discardText?: string;
  /**
   * Cancel button text to stay in the modal
   */
  stayText?: string;
  /**
   * Whether to disable Escape or backdrop dismiss
   */
  disabled?: boolean;
}

export interface UseModalDismissReturn {
  requestClose: () => Promise<void>;
  handleBackdropClick: (e: React.MouseEvent) => void;
}

/**
 * Senior Modal Dismiss Hook (Rafiq POS)
 * Handles Escape key navigation and backdrop outside-clicks gracefully.
 * Automatically checks for dirty/unsaved state and prompts the user before discarding work.
 */
export function useModalDismiss({
  isOpen,
  onClose,
  onDismiss,
  isDirty = false,
  confirmTitle = 'تعديلات غير محفوظة',
  confirmMessage = 'هناك تعديلات لم يتم حفظها، هل أنت متأكد من الخروج وتجاهل التعديلات؟',
  discardText = 'تجاهل والخروج',
  stayText = 'البقاء للمتابعة',
  disabled = false,
}: UseModalDismissOptions): UseModalDismissReturn {
  const dismissFn = onClose || onDismiss || (() => {});
  const isDirtyRef = useRef(isDirty);
  const onCloseRef = useRef(dismissFn);
  const confirmTitleRef = useRef(confirmTitle);
  const confirmMessageRef = useRef(confirmMessage);
  const discardTextRef = useRef(discardText);
  const stayTextRef = useRef(stayText);

  useEffect(() => {
    isDirtyRef.current = isDirty;
    onCloseRef.current = onClose || onDismiss || (() => {});
    confirmTitleRef.current = confirmTitle;
    confirmMessageRef.current = confirmMessage;
    discardTextRef.current = discardText;
    stayTextRef.current = stayText;
  });

  const requestClose = useCallback(async () => {
    if (disabled) return;

    // If an alert or confirmation is currently showing, don't trigger another one
    if (isRafiqDialogOpen()) return;

    const dirty = typeof isDirtyRef.current === 'function'
      ? isDirtyRef.current()
      : Boolean(isDirtyRef.current);

    if (dirty) {
      const confirmed = await rafiqConfirm({
        title: confirmTitleRef.current,
        message: confirmMessageRef.current,
        confirmText: discardTextRef.current,
        cancelText: stayTextRef.current,
        variant: 'warning',
      });
      if (confirmed) {
        onCloseRef.current();
      }
    } else {
      onCloseRef.current();
    }
  }, [disabled]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        e.preventDefault();
        e.stopPropagation();
        void requestClose();
      }
    },
    [requestClose]
  );

  useEffect(() => {
    if (!isOpen || disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // If a higher priority confirmation dialog is open, let that dialog handle Escape
        if (isRafiqDialogOpen()) return;

        e.preventDefault();
        e.stopPropagation();
        void requestClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, disabled, requestClose]);

  return {
    requestClose,
    handleBackdropClick,
  };
}
