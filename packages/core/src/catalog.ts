import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Catalog, CoatingData, GridTable } from './types';

/** Load a price-list version from data/<supplier>/<version>/ (server side only). */
export function loadCatalog(dir: string, version: string): Catalog {
  const tablesDir = join(dir, 'tables');
  const tables: Record<string, GridTable> = {};
  for (const f of readdirSync(tablesDir)) {
    if (!f.endsWith('.json')) continue;
    const t = JSON.parse(readFileSync(join(tablesDir, f), 'utf8')) as GridTable;
    tables[t.id] = t;
  }
  const coating = JSON.parse(readFileSync(join(dir, 'coating.json'), 'utf8')) as CoatingData;
  return { version, tables, coating };
}
