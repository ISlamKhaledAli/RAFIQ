import React, { useState, useEffect } from 'react';
import { invoke } from '../bridge/ipc';
import { FeaturesContext, DEFAULT_FLAGS } from './featureTypes';

export const FeaturesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flags, setFlags] = useState<Record<string, boolean>>(DEFAULT_FLAGS);
  const [, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const remoteFlags = await invoke<Record<string, boolean>>('features:getAll');
        if (active && remoteFlags) {
          setFlags((prev) => ({ ...prev, ...remoteFlags }));
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
    setFlags((prev) => ({ ...prev, [key]: enabled }));
    try {
      await invoke('features:set', { key, enabled });
    } catch (err: unknown) {
      setFlags((prev) => ({ ...prev, [key]: !enabled }));
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
