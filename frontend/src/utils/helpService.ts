/**
 * Global Help Center Service (Feature #147 / Tasks 147-1, 147-2, 147-3)
 * Allows any screen or component to launch the offline Help Center with its specific section.
 */

export type HelpSectionTarget = 
  | 'pos' 
  | 'products' 
  | 'purchases' 
  | 'customers' 
  | 'sales' 
  | 'backup_security' 
  | 'faq' 
  | 'support'
  | 'dashboard'
  | 'settings';

export function openHelpCenter(section?: HelpSectionTarget | string) {
  try {
    window.dispatchEvent(new CustomEvent('rafiq:open-help', { 
      detail: { section: section || 'pos' } 
    }));
  } catch (err) {
    console.error('Failed to dispatch rafiq:open-help', err);
  }
}

