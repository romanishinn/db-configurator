import type { Catalog, CoatingData, ColorData, FabricData, GlazingData, GridTable, ScreenMotorData, ControlItem } from './types';

/** Assemble a price-list version from already-loaded JSON (browser-safe). */
export function buildCatalog(version: string, tables: GridTable[], coating: CoatingData, extra: { colors?: ColorData; fabrics?: FabricData; screenMotors?: ScreenMotorData; screenControls?: { items: ControlItem[] }; optionScalars?: Record<string, unknown>; glazing?: GlazingData } = {}): Catalog {
  return { version, tables: Object.fromEntries(tables.map((t) => [t.id, t])), coating, ...extra };
}
