export interface PrintReceiptRequest {
  saleId: string;
  isCopy: boolean;
  openDrawer?: boolean;
  printerName?: string;
  paperWidth?: string;
}

export interface PrintResult {
  success: boolean;
  message: string;
  printerUsed: string;
  drawerStatus: 'notRequested' | 'blocked' | 'submitted' | 'failed' | 'unknown';
  warningCode?: string | null;
  warningMessage?: string | null;
}

export interface DrawerSafetyStatus {
  canOpen: boolean;
  code: string;
  message: string;
}
