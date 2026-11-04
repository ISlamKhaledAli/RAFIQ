import type { FeatureDefinitionDto } from './featureTypes';

/**
 * A feature is effective only when its own flag is on AND every feature it
 * `requires` (recursively) is effective too. Cycles are ignored safely.
 */
export function isFeatureEffectivelyEnabled(
  key: string,
  flags: Record<string, boolean>,
  registry: FeatureDefinitionDto[],
  visiting: Set<string> = new Set<string>(),
): boolean {
  if (!flags[key]) return false;
  if (visiting.has(key)) return true;

  const def = registry.find((d) => d.key === key);
  if (!def || !def.requires || def.requires.length === 0) return true;

  visiting.add(key);
  const satisfied = def.requires.every((req) => isFeatureEffectivelyEnabled(req, flags, registry, visiting));
  visiting.delete(key);
  return satisfied;
}
