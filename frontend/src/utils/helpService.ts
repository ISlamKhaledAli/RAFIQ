/**
 * Global Help Center Service (Feature #147 / Tasks 147-1, 147-2, 147-3)
 * Allows any screen or component to launch the offline Help Center with its specific section.
 */

import type { HelpSectionId } from './helpContent';

/** A guide id, or the name of a screen that maps to a guide (dashboard, settings, epay). */
export type HelpSectionTarget = HelpSectionId | 'dashboard' | 'settings' | 'epay';

export function openHelpCenter(section?: HelpSectionTarget | string) {
  try {
    window.dispatchEvent(new CustomEvent('rafiq:open-help', { 
      detail: { section: section || 'pos' } 
    }));
  } catch (err) {
    console.error('Failed to dispatch rafiq:open-help', err);
  }
}

