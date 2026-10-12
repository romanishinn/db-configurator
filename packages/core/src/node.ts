// Node-only helper for tests and import tools. Not exported from index.ts (the app runs in the browser).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCatalog } from './catalog';
import type { CoatingData, ColorData, FabricData, GlazingData, GridTable, ScreenMotorData, ControlItem } from './types';

export function loadCatalog(dir: string, version: string) {
  const tablesDir = join(dir, 'tables');
  const tables = readdirSync(tablesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(tablesDir, f), 'utf8')) as GridTable);
  const json = <T>(name: string) => (existsSync(join(dir, name)) ? (JSON.parse(readFileSync(join(dir, name), 'utf8')) as T) : undefined);
  const coating = json<CoatingData>('coating.json')!;
  return buildCatalog(version, tables, coating, { colors: json<ColorData>('colors.json'), fabrics: json<FabricData>('fabrics.json'), screenMotors: json<ScreenMotorData>('screen-motors.json'), screenControls: json<{ items: ControlItem[] }>('screen-controls.json'), optionScalars: json<Record<string, unknown>>('options-scalars.json'), glazing: json<GlazingData>('glass-glazing.json') });
}
