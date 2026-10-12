import { lookupGrid, NotProducedError, OutOfRangeError } from './grid';
import type { Catalog, GridTable, Issue, SourceRef } from './types';

export type GlassOpening = 'single' | 'double';

export interface GlassRequest {
  /** opening width and height, mm */
  width: number;
  height: number;
  thickness?: 8 | 10;
  /** omit to let the selector compare single- and double-side opening */
  opening?: GlassOpening;
}

export interface GlassOption {
  table: string;
  thickness: 8 | 10;
  tracks: 4 | 6;
  opening: GlassOpening;
  panels: number;
  price: number;
  billed: { width: number; height: number };
  /** catalogue glass panel width and parking width at the billed width */
  panelWidth: number | null;
  parkingWidth: number | null;
  source: SourceRef;
}

export interface GlassResult {
  options: GlassOption[];
  best: GlassOption | null;
  issues: Issue[];
}

interface GlassMeta { thickness: 8 | 10; tracks: 4 | 6; opening: GlassOpening; panels: number; glassWidth: (number | null)[]; parkingWidth: (number | null)[] }

const glassTables = (cat: Catalog) => Object.values(cat.tables).filter((t) => t.id.startsWith('glass.')) as (GridTable & { meta: GlassMeta })[];

/** Every Win Glass variant that produces this opening, cheapest first. */
export function selectGlass(req: GlassRequest, cat: Catalog): GlassResult {
  const options: GlassOption[] = [];
  let maxHeightForWidth = 0;
  for (const t of glassTables(cat)) {
    const m = t.meta;
    if (req.thickness && m.thickness !== req.thickness) continue;
    if (req.opening && m.opening !== req.opening) continue;
    try {
      const g = lookupGrid(t, req.width, req.height);
      const xi = t.x.values.indexOf(g.x);
      options.push({
        table: t.id, thickness: m.thickness, tracks: m.tracks, opening: m.opening, panels: m.panels, price: g.price,
        billed: { width: g.x, height: g.y }, panelWidth: m.glassWidth[xi] ?? null, parkingWidth: m.parkingWidth[xi] ?? null,
        source: { ...g.source, page: pageOf(t, g.x) },
      });
    } catch (e) {
      if (e instanceof NotProducedError || (e instanceof OutOfRangeError && e.axis === 'y')) {
        maxHeightForWidth = Math.max(maxHeightForWidth, maxHeight(t, req.width));
      } else if (!(e instanceof OutOfRangeError)) throw e;
    }
  }
  options.sort((a, b) => a.price - b.price || a.panels - b.panels);
  const issues: Issue[] = [];
  if (!options.length) {
    if (maxHeightForWidth > 0) issues.push({ severity: 'block', code: 'GLASS_TOO_HIGH', params: { requested: req.height, maxHeight: maxHeightForWidth } });
    else issues.push({ severity: 'block', code: 'GLASS_WIDTH_OUT_OF_RANGE', params: { requested: req.width, min: 2000, max: 17750 } });
  }
  return { options, best: options[0] ?? null, issues };
}

/** Highest height produced at this width in a table (0 if the width is outside the table). */
function maxHeight(t: GridTable, width: number): number {
  const xi = t.x.values.findIndex((x) => x >= width);
  if (xi < 0) return 0;
  let best = 0;
  t.y.values.forEach((h, yi) => { if (t.prices[yi]![xi] != null) best = h; });
  return best;
}

/** Continuation pages: widths beyond the first page's range live on the next page. */
function pageOf(t: GridTable, width: number): number {
  const pages = t.source.pages ?? [t.source.page];
  if (pages.length === 1) return pages[0]!;
  // 10- and 12-panel tables continue on a second page above these widths (pp.21–22/31–32 and 23–24/33–34)
  const boundary = t.id.endsWith('.10p') ? 10500 : 12500;
  return width > boundary ? pages[1]! : pages[0]!;
}
