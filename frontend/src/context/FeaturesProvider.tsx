import React, { useState, useEffect } from 'react';
import { invoke } from '../bridge/ipc';
import { FeaturesContext, DEFAULT_FLAGS } from './featureTypes';

export const FeaturesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flags, setFlags] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('rafiq_feature_flags');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_FLAGS, ...parsed };
        }
      }
    } catch {}
    return DEFAULT_FLAGS;
  });
  const [, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const remoteFlags = await invoke<Record<string, boolean>>('features:getAll');
        if (active && remoteFlags && typeof remoteFlags === 'object') {
          const validFlags: Record<string, boolean> = {};
          for (const k of Object.keys(remoteFlags)) {
            if (typeof (remoteFlags as any)[k] === 'boolean') {
              validFlags[k] = (remoteFlags as any)[k];
            }
          }
          if (Object.keys(validFlags).length > 0) {
            setFlags((prev) => {
              const merged = { ...prev, ...validFlags };
              try {
                localStorage.setItem('rafiq_feature_flags', JSON.stringify(merged));
              } catch {}
              return merged;
            });
          }
        }
      } catch (err: unknown) {
        console.error('Failed to load feature flags:', err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const isEnabled = (key: string): boolean => {
    return flags[key] !== undefined ? flags[key] : false;
  };

  const toggleFlag = async (key: string, enabled: boolean) => {
    setLoading(true);
    setFlags((prev) => {
      const next = { ...prev, [key]: enabled };
      try {
        localStorage.setItem('rafiq_feature_flags', JSON.stringify(next));
      } catch {}
      return next;
    });
    try {
      await invoke('features:set', { key, enabled });
    } catch (err: unknown) {
      setFlags((prev) => {
        const reverted = { ...prev, [key]: !enabled };
        try {
          localStorage.setItem('rafiq_feature_flags', JSON.stringify(reverted));
        } catch {}
        return reverted;
      });
      console.error('Failed to update feature flag:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return (
    <FeaturesContext.Provider value={{ flags, isEnabled, toggleFlag, loading: false }}>
      {children}
    </FeaturesContext.Provider>
  );
};
