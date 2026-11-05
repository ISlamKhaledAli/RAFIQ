// The built-in receipt signature images: every PNG in src/assets/signatures (a mirror of desktop/Resources/signatures, kept in sync by
// `npm run sync:signatures`). Vite resolves each file to its URL; the list is sorted ordinally by file name, exactly like the host sorts
// its embedded resources, so the per-invoice pick lands on the same image in the preview and on the thermal printer.
// Not importable from node tests (import.meta.glob is Vite-only): the pure helpers take the list as a parameter.
const modules = import.meta.glob<string>('../assets/signatures/*.png', { eager: true, query: '?url', import: 'default' });

const ordinal = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const BUILT_IN_SIGNATURE_IMAGES: readonly string[] = Object.keys(modules)
  .sort(ordinal)
  .map((path) => modules[path]);
