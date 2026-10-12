import { lookupGrid, NotProducedError, OutOfRangeError } from './grid';
import { round2 } from './money';
import type { Catalog, GlazingType, GridTable, Issue, SourceRef } from './types';

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

export interface GlazingResult {
  type: GlazingType;
  /** EUR per m², null if this glazing is not available in the thickness */
  rate: number | null;
  m2: number;
  amount: number;
  issues: Issue[];
  source?: SourceRef;
}

/**
 * Surcharge for a non-standard glazing (p.9): rate per m² × opening area.
 * ASSUMPTION: the area is the opening width × height (the system size), not the net glass area.
 */
export function glazingSurcharge(type: GlazingType, thickness: 8 | 10, width: number, height: number, cat: Catalog): GlazingResult {
  const g = cat.glazing;
  const m2 = round2((width * height) / 1e6);
  const t = g?.types.find((x) => x.id === type);
  if (!g || !t) return { type, rate: null, m2, amount: 0, issues: [{ severity: 'block', code: 'GLAZING_UNKNOWN', params: { type } }] };
  const rate = t.surcharge[String(thickness) as '8' | '10'];
  const source = { file: g.source.file, page: g.source.page };
  if (rate == null) {
    const other = thickness === 8 ? 10 : 8;
    return { type, rate: null, m2, amount: 0, source, issues: [{ severity: 'block', code: 'GLAZING_NOT_IN_THICKNESS', params: { type, thickness, available: t.surcharge[String(other) as '8' | '10'] != null ? other : 0 } }] };
  }
  return { type, rate, m2, amount: round2(rate * m2), source, issues: [] };
}

/** Glass thickness a glazing needs: 8 mm by default, 10 mm when the glazing exists only in 10 mm (mirror). */
export function thicknessFor(type: GlazingType, cat: Catalog): 8 | 10 {
  const t = cat.glazing?.types.find((x) => x.id === type);
  return t && t.surcharge['8'] == null && t.surcharge['10'] != null ? 10 : 8;
}
