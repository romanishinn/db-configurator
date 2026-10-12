import type { Catalog, CoatingData, ColorData, FabricData, GridTable } from './types';

/** Assemble a price-list version from already-loaded JSON (browser-safe). */
export function buildCatalog(version: string, tables: GridTable[], coating: CoatingData, extra: { colors?: ColorData; fabrics?: FabricData } = {}): Catalog {
  return { version, tables: Object.fromEntries(tables.map((t) => [t.id, t])), coating, ...extra };
}
