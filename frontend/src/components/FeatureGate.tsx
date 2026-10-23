import React from 'react';
import { useFeatures } from '../context/useFeatures';

export interface FeatureGateProps {
  flag?: string;
  flags?: string[];
  requireAll?: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * FeatureGate component (Task 182-4)
 * Renders children only if the specified feature flag(s) are active in the current store profile.
 */
export const FeatureGate: React.FC<FeatureGateProps> = ({
  flag,
  flags,
  requireAll = true,
  fallback = null,
  children,
}) => {
  const { isEnabled } = useFeatures();

  let active = true;

  if (flag) {
    active = isEnabled(flag);
  } else if (flags && flags.length > 0) {
    if (requireAll) {
      active = flags.every((f) => isEnabled(f));
    } else {
      active = flags.some((f) => isEnabled(f));
    }
  }

  if (!active) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
