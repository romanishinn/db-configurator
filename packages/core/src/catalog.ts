import type { Catalog, CoatingData, ColorData, FabricData, GridTable, ScreenMotorData, ControlItem } from './types';

/** Assemble a price-list version from already-loaded JSON (browser-safe). */
export function buildCatalog(version: string, tables: GridTable[], coating: CoatingData, extra: { colors?: ColorData; fabrics?: FabricData; screenMotors?: ScreenMotorData; screenControls?: { items: ControlItem[] } } = {}): Catalog {
  return { version, tables: Object.fromEntries(tables.map((t) => [t.id, t])), coating, ...extra };
}
