import { useEffect, useRef, useState } from 'react';
import { getMotionSnapshot } from '../utils/motion';
import { exitDurationMs } from '../utils/motionExit';

function readExitMs(): number {
  if (typeof document === 'undefined') return 0;
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return exitDurationMs(
    getComputedStyle(document.documentElement).getPropertyValue('--rq-motion-duration'),
    getMotionSnapshot(),
    reduced,
    document.hidden
  );
}

export interface ExitValue<T> {
  value: T | null;
  exiting: boolean;
}

/**
 * Keeps the last shown value mounted for the shared motion duration after it turns falsy, so the element can play its
 * exit animation: `const toast = useExitValue(message)` then render `toast.value` and put `data-exiting={toast.exiting || undefined}`
 * on the element (index.css turns that into the exit). Only the visual unmount is deferred: the caller's state is already updated.
 * Motion off, reduced motion or a hidden tab: `value` is null in the very same render, no timer is ever started.
 * The timer is cleared when the value comes back or the component unmounts.
 */
export function useExitValue<T>(value: T | null | undefined | false): ExitValue<T> {
  const live = value ? value : null;
  const [held, setHeld] = useState<T | null>(live);
  if (live !== null && held !== live) setHeld(live);

  const exiting = live === null && held !== null && readExitMs() > 0;
  const isLive = live !== null;

  useEffect(() => {
    if (isLive || held === null) return undefined;
    const ms = readExitMs();
    if (ms <= 0) {
      setHeld(null);
      return undefined;
    }
    const timer = window.setTimeout(() => setHeld(null), ms);
    return () => window.clearTimeout(timer);
  }, [isLive, held]);

  return { value: live ?? (exiting ? held : null), exiting };
}

/** Boolean flavour for panels that only need "still mounted" and "is leaving": `const { mounted, exiting } = useExitTransition(open)`. */
export function useExitTransition(open: boolean): { mounted: boolean; exiting: boolean } {
  const state = useExitValue<true>(open ? true : null);
  return { mounted: state.value === true, exiting: state.exiting };
}

export interface ExitListEntry<T> {
  item: T;
  exiting: boolean;
}

interface Ghost<T> {
  item: T;
  index: number;
}

// Live rows with the ghosts put back at the index they had in the list that was on screen when they were removed
function mergeEntries<T>(live: T[], ghosts: Ghost<T>[]): ExitListEntry<T>[] {
  const entries: ExitListEntry<T>[] = live.map((item) => ({ item, exiting: false }));
  [...ghosts]
    .sort((a, b) => a.index - b.index)
    .forEach((g) => entries.splice(Math.min(g.index, entries.length), 0, { item: g.item, exiting: true }));
  return entries;
}

/**
 * List flavour: items that disappear from `items` stay in the returned list (exiting = true) for the shared duration, at the
 * position they had, so every row can play its own exit. `enabled` false (a closed drawer) tracks nothing and returns the plain list.
 * Each ghost owns one timer; timers are cleared when the item returns, when the list is disabled and on unmount.
 */
export function useExitList<T extends { id: string }>(items: T[], enabled: boolean): ExitListEntry<T>[] {
  const [shown, setShown] = useState<T[]>(items);
  const [ghosts, setGhosts] = useState<Ghost<T>[]>([]);
  const timers = useRef(new Map<string, number>());

  if (items !== shown) {
    const liveIds = new Set(items.map((i) => i.id));
    let next = enabled ? ghosts.filter((g) => !liveIds.has(g.item.id)) : [];
    if (enabled && readExitMs() > 0) {
      const added: Ghost<T>[] = [];
      mergeEntries(shown, ghosts).forEach((entry, index) => {
        if (!entry.exiting && !liveIds.has(entry.item.id)) added.push({ item: entry.item, index });
      });
      if (added.length > 0) next = [...next, ...added];
    }
    setShown(items);
    if (next.length !== ghosts.length || next.some((g, i) => g !== ghosts[i])) setGhosts(next);
  } else if (!enabled && ghosts.length > 0) {
    setGhosts([]);
  }

  useEffect(() => {
    const map = timers.current;
    const alive = new Set(ghosts.map((g) => g.item.id));
    map.forEach((timer, id) => {
      if (!alive.has(id)) {
        window.clearTimeout(timer);
        map.delete(id);
      }
    });
    ghosts.forEach((g) => {
      const id = g.item.id;
      if (map.has(id)) return;
      map.set(
        id,
        window.setTimeout(() => {
          map.delete(id);
          setGhosts((current) => current.filter((x) => x.item.id !== id));
        }, readExitMs())
      );
    });
  }, [ghosts]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => window.clearTimeout(timer));
      map.clear();
    };
  }, []);

  return mergeEntries(items, ghosts);
}
