export function copyCartForUpdate<T extends object>(items: readonly T[]): T[] {
  return items.map((item) => ({ ...item }));
}
