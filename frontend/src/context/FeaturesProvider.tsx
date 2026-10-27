import React, { useState, useEffect } from 'react';
import { invoke } from '../bridge/ipc';
import { 
  FeaturesContext, 
  DEFAULT_FLAGS, 
  DEFAULT_REGISTRY, 
  type FeatureDefinitionDto 
} from './featureTypes';

export const FeaturesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flags, setFlags] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('rafiq_feature_flags');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          if (parsed.feature_pharmacy && parsed.feature_drug_interactions === undefined) {
            parsed.feature_drug_interactions = true;
          }
          return { ...DEFAULT_FLAGS, ...parsed };
        }
      }
    } catch {}
    return DEFAULT_FLAGS;
  });

  const [registry, setRegistry] = useState<FeatureDefinitionDto[]>(() => {
    try {
      const stored = localStorage.getItem('rafiq_feature_registry');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return DEFAULT_REGISTRY;
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        // Fetch registry from C# FeatureRegistry (Task 182-4)
        const remoteRegistry = await invoke<FeatureDefinitionDto[]>('system.getFeatureRegistry');
        if (active && Array.isArray(remoteRegistry) && remoteRegistry.length > 0) {
          setRegistry(remoteRegistry);
          try {
            localStorage.setItem('rafiq_feature_registry', JSON.stringify(remoteRegistry));
          } catch {}
        }
      } catch (err: unknown) {
        console.warn('Could not load feature registry from backend, using default:', err);
      }

      try {
        // Fetch current active flags from database
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
    const def = registry.find((d) => d.key === key);

    // Client-side dependency guard
    if (enabled && def && def.requires && def.requires.length > 0) {
      const missing = def.requires.filter((reqKey) => !flags[reqKey]);
      if (missing.length > 0) {
        const missingNames = missing
          .map((m) => registry.find((d) => d.key === m)?.nameAr || m)
          .join('، ');
        const err = new Error(
          `الميزة «${def.nameAr}» تتطلب أولاً تفعيل الميزات التالية: ${missingNames}`
        );
        throw err;
      }
    }

    if (!enabled && def) {
      const dependents = registry.filter(
        (other) => flags[other.key] && other.requires && other.requires.includes(key)
      );
      if (dependents.length > 0) {
        const depNames = dependents.map((d) => d.nameAr).join('، ');
        const err = new Error(
          `لا يمكن تعطيل الميزة «${def.nameAr}» لأن الميزات التالية مفعلة وتعتمد عليها: ${depNames}`
        );
        throw err;
      }
    }

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
    <FeaturesContext.Provider value={{ flags, registry, isEnabled, toggleFlag, loading }}>
      {children}
    </FeaturesContext.Provider>
  );
};
