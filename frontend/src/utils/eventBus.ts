import { useEffect } from 'react';

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

/**
 * Emit a data change notification to all subscribed views in the system
 */
export function emitDataChanged(topicOrTopics: RafiqDataTopic | RafiqDataTopic[]): void {
  const topics = Array.isArray(topicOrTopics) ? topicOrTopics : [topicOrTopics];
  if (typeof window === 'undefined') return;

  const detail: RafiqDataEventDetail = {
    topics,
    timestamp: Date.now(),
  };

  window.dispatchEvent(new CustomEvent<RafiqDataEventDetail>(EVENT_NAME, { detail }));
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
 * React hook to auto-subscribe and auto-cleanup data change listeners
 */
export function useDataSubscription(
  topics: RafiqDataTopic | RafiqDataTopic[] | '*',
  callback: () => void
): void {
  useEffect(() => {
    const unsubscribe = onDataChanged(topics, callback);
    return () => {
      unsubscribe();
    };
  }, [topics, callback]);
}
