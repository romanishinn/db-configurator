import type { Catalog, CoatingData, GridTable } from './types';

/** Assemble a price-list version from already-loaded JSON (browser-safe). */
export function buildCatalog(version: string, tables: GridTable[], coating: CoatingData): Catalog {
  return { version, tables: Object.fromEntries(tables.map((t) => [t.id, t])), coating };
}
