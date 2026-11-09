import { INITIAL_STORE_TEMPLATES, type StoreTemplateDto } from '../constants/storeTemplates.ts';

const HIDDEN_TEMPLATE_IDS: readonly string[] = ['accessories_gifts'];

/** The list the wizard renders: the host list without hidden templates, or the bundled list when the host returns nothing usable. */
export function resolveWizardTemplates(hostList: unknown): StoreTemplateDto[] {
  if (!Array.isArray(hostList)) return INITIAL_STORE_TEMPLATES;
  const visible = (hostList as StoreTemplateDto[]).filter((t) => !HIDDEN_TEMPLATE_IDS.includes(t.id));
  return visible.length > 0 ? visible : INITIAL_STORE_TEMPLATES;
}

/** First candidate that exists in the list, else the first template, so the selection is final before the first card is painted. */
export function pickWizardTemplateId(templates: readonly StoreTemplateDto[], ...candidates: (string | undefined)[]): string {
  for (const id of candidates) {
    if (id && templates.some((t) => t.id === id)) return id;
  }
  return templates[0]?.id ?? '';
}
