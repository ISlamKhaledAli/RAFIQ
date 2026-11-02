export type UnitsLoadState = 'ready' | 'loading' | 'error';

/**
 * The server treats the saved units list as authoritative, so an existing product may only be
 * saved once its real units have loaded; a placeholder list would delete its other units.
 */
export function canSaveProductUnits(isExistingProduct: boolean, state: UnitsLoadState): boolean {
  return !isExistingProduct || state === 'ready';
}

export function unitsLoadBlockMessage(state: UnitsLoadState): string {
  return state === 'error'
    ? 'تعذر تحميل وحدات الصنف من قاعدة البيانات، لا يمكن الحفظ قبل تحميلها. اضغط إعادة المحاولة.'
    : 'جاري تحميل وحدات الصنف... انتظر لحظة قبل الحفظ.';
}
