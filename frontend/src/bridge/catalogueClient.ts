import { invoke } from './ipc.ts';
import type { CataloguePage, CatalogueRequest, CataloguePreview, CatalogueApplyResult } from '../types/catalogue.ts';

export const catalogueClient = {
  getReference: (page = 1, query = '', category = '') =>
    invoke<CataloguePage>('catalogue:getReference', { page, pageSize: 25, query, category }),
  preview: (request: CatalogueRequest) => invoke<CataloguePreview>('catalogue:preview', request),
  apply: (request: CatalogueRequest) => invoke<CatalogueApplyResult>('catalogue:apply', request, 120000),
};
