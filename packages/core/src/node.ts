// Node-only helper for tests and import tools. Not exported from index.ts (the app runs in the browser).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCatalog } from './catalog';
import type { CoatingData, GridTable } from './types';

export function loadCatalog(dir: string, version: string) {
  const tablesDir = join(dir, 'tables');
  const tables = readdirSync(tablesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(tablesDir, f), 'utf8')) as GridTable);
  const coating = JSON.parse(readFileSync(join(dir, 'coating.json'), 'utf8')) as CoatingData;
  return buildCatalog(version, tables, coating);
}
