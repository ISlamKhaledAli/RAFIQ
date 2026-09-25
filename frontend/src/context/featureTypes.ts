import { createContext } from 'react';

export interface FeaturesState {
  flags: Record<string, boolean>;
  isEnabled: (key: string) => boolean;
  toggleFlag: (key: string, enabled: boolean) => Promise<void>;
  loading: boolean;
}

export const DEFAULT_FLAGS: Record<string, boolean> = {
  feature_scale_weight: true,
  feature_credit_debts: true,
  feature_fast_buttons: true,
  feature_taxes: false,
  feature_expiry_dates: false,
  feature_multi_units: false,
};

export const FeaturesContext = createContext<FeaturesState>({
  flags: DEFAULT_FLAGS,
  isEnabled: () => true,
  toggleFlag: async () => {},
  loading: false,
});
