import { useEffect, useRef } from 'react';

export type RafiqDataTopic = 
  | 'products' 
  | 'categories' 
  | 'sales' 
  | 'customers' 
  | 'suppliers' 
  | 'purchases' 
  | 'settings' 
  | 'held_sales' 
  | 'dashboard' 
  | 'all';

interface RafiqDataEventDetail {
  topics: RafiqDataTopic[];
  timestamp: number;
}

const EVENT_NAME = 'rafiq:data-changed';

let emitTimer: ReturnType<typeof setTimeout> | null = null;
const queuedTopics = new Set<RafiqDataTopic>();

/**
 * Emit a data change notification to all subscribed views in the system.
 * Uses a 50ms batching debounce to eliminate rapid thrashing and prevent recursive event cascading loops.
 */
export function emitDataChanged(topicOrTopics: RafiqDataTopic | RafiqDataTopic[]): void {
  const topics = Array.isArray(topicOrTopics) ? topicOrTopics : [topicOrTopics];
  if (typeof window === 'undefined') return;

  for (let i = 0; i < topics.length; i++) {
    queuedTopics.add(topics[i]);
  }

  if (emitTimer) return;

  emitTimer = setTimeout(() => {
    emitTimer = null;
    const finalTopics = Array.from(queuedTopics);
    queuedTopics.clear();

    if (finalTopics.length === 0) return;

    const detail: RafiqDataEventDetail = {
      topics: finalTopics,
      timestamp: Date.now(),
    };

    window.dispatchEvent(new CustomEvent<RafiqDataEventDetail>(EVENT_NAME, { detail }));
  }, 50);
}

/**
 * Listen for data change events matching specified topics
 * Returns an unsubscribe cleanup function.
 */
export function onDataChanged(
  listenedTopics: RafiqDataTopic | RafiqDataTopic[] | '*',
  callback: () => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const targets = listenedTopics === '*' 
    ? '*' 
    : (Array.isArray(listenedTopics) ? listenedTopics : [listenedTopics]);

  const handler = (e: Event) => {
    const customEvt = e as CustomEvent<RafiqDataEventDetail>;
    const eventTopics = customEvt.detail?.topics || [];

    if (targets === '*' || eventTopics.includes('all')) {
      callback();
      return;
    }

    const hasMatch = targets.some((t) => eventTopics.includes(t));
    if (hasMatch) {
      callback();
    }
  };

  window.addEventListener(EVENT_NAME, handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
  };
}

/**
 * React hook to auto-subscribe and auto-cleanup data change listeners.
 * Uses a ref to ensure the callback is always fresh without thrashing subscriptions.
 */
export function useDataSubscription(
  topics: RafiqDataTopic | RafiqDataTopic[] | '*',
  callback: () => void
): void {
  const cbRef = useRef(callback);

  useEffect(() => {
    cbRef.current = callback;
  });

  const topicsKey = Array.isArray(topics) ? topics.join(',') : topics;

  useEffect(() => {
    const list: RafiqDataTopic[] | '*' = topicsKey === '*' ? '*' : (topicsKey.split(',') as RafiqDataTopic[]);
    const unsubscribe = onDataChanged(list, () => {
      cbRef.current();
    });
    return () => {
      unsubscribe();
    };
  }, [topicsKey]);
}
