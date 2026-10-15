import { lookupGrid, OutOfRangeError } from './grid';
import { round2 } from './money';
import type { Catalog, ColorGroup, Issue, Line, PriceResult } from './types';

/** SLIDE = sliding-roof pergola: the louvres fold together towards one end instead of rotating. */
export type PergolaModel = 'S400' | 'S500' | 'SLIDE';
export type Mount = 'wall' | 'free' | 'roof';
export interface PergolaColor { construction: ColorGroup; roof: ColorGroup; same?: boolean }

export interface PergolaConfig {
  model: PergolaModel;
  mount: Mount;
  /** S500 only: 'double' = two roofs without a central post */
  layout?: 'single' | 'double';
  /** S500 / SLIDE: base module or an additional module attached to it */
  module?: 'base' | 'add' | 'addNoRoof';
  width: number;
  projection: number;
  /** coating groups of the construction and the roof (louvres); same = one colour on the whole pergola */
  color?: PergolaColor;
}

/** S500: a projection off the 250 mm grid is possible for a surcharge (catalogue S500, p.14). */
export const S500_INDIVIDUAL_PROJECTION_EUR = 975;
const S400_PROJECTION_STEP = 200;
const S500_PROJECTION_STEP = 250;

function tableId(c: PergolaConfig): string {
  if (c.model === 'S400') return `s400.${c.mount}`;
  // Slide p.9: one roof-module table for the base and additional modules
  if (c.model === 'SLIDE') return c.mount === 'roof' ? 'slide.roof' : `slide.${c.mount}.${c.module === 'add' ? 'add' : 'base'}`;
  const layout = c.layout ?? 'single';
  const module = c.module ?? 'base';
  if (module === 'addNoRoof') return 's500.single.noroof.add';
  return `s500.${layout}.${c.mount}.${module}`;
}

export function pricePergola(c: PergolaConfig, cat: Catalog): PriceResult {
  const issues: Issue[] = [];
  const lines: Line[] = [];

  if (c.model === 'S400' && c.layout === 'double') {
    issues.push({ severity: 'block', code: 'S400_NO_DOUBLE' });
    return { lines, total: 0, issues };
  }
  if (c.model === 'SLIDE' && (c.layout === 'double' || c.module === 'addNoRoof')) {
    issues.push({ severity: 'block', code: 'SLIDE_LAYOUT', params: { layout: c.layout ?? '', module: c.module ?? '' } });
    return { lines, total: 0, issues };
  }
  if (c.module === 'addNoRoof' && c.mount !== 'wall') {
    issues.push({ severity: 'block', code: 'S500_NOROOF_WALL_ONLY' });
    return { lines, total: 0, issues };
  }

  const id = tableId(c);
  const table = cat.tables[id];
  if (!table) throw new Error(`price table ${id} missing in catalog ${cat.version}`);

  let projection = c.projection;
  if (c.model === 'S400' && projection % S400_PROJECTION_STEP !== 0) {
    // S400: louvre pitch fixes the projection to the 200 mm grid; no individual projection.
    const snapped = Math.ceil(projection / S400_PROJECTION_STEP) * S400_PROJECTION_STEP;
    issues.push({ severity: 'block', code: 'S400_PROJECTION_GRID', params: { requested: projection, suggested: snapped } });
    projection = snapped;
  }

  let g;
  let slide: ReturnType<typeof slideProjection> | null = null;
  try {
    if (c.model === 'SLIDE') {
      slide = slideProjection(table, projection);
      projection = slide.range[1]; // the row's y value
    }
    g = lookupGrid(table, c.width, projection);
  } catch (e) {
    if (e instanceof OutOfRangeError) {
      issues.push({ severity: 'block', code: 'SIZE_OUT_OF_RANGE', params: { axis: e.axis === 'x' ? 'width' : 'projection', value: e.value, min: e.min, max: e.max } });
      return { lines, total: 0, issues };
    }
    throw e;
  }

  lines.push({
    code: 'PERGOLA_BASE',
    params: { model: c.model, table: id, width: g.x, projection: slide ? slide.built : g.y, louvers: g.louvers ?? '', ...(slide ? { rangeFrom: slide.range[0], rangeTo: slide.range[1] } : {}) },
    amount: g.price,
    source: g.source,
  });
  if (slide && slide.built !== c.projection) {
    issues.push({ severity: 'warn', code: 'SLIDE_PROJECTION_SNAPPED', params: { requested: c.projection, built: slide.built, louvers: g.louvers ?? '', rangeFrom: slide.range[0], rangeTo: slide.range[1] } });
  }
  if (g.x !== c.width) issues.push({ severity: 'info', code: 'BILLED_AT_NEXT_WIDTH', params: { requested: c.width, billed: g.x } });

  if (c.model === 'S500' && c.projection % S500_PROJECTION_STEP !== 0) {
    lines.push({
      code: 'S500_INDIVIDUAL_PROJECTION',
      params: { projection: c.projection },
      amount: S500_INDIVIDUAL_PROJECTION_EUR,
      source: { file: table.source.file, page: table.source.page },
    });
  }

  if (c.color) {
    const pct = coatingPercent(c.model, c.color, cat);
    if (pct > 0) {
      // ASSUMPTION (open question to the manufacturer): the percentage applies to the base grid price only.
      lines.push({
        code: 'COATING_SURCHARGE',
        params: { percent: pct, construction: c.color.construction, roof: c.color.roof },
        amount: round2((g.price * pct) / 100),
        source: { url: 'manufacturer coating calculator 07.2026' },
      });
    }
  }

  const total = round2(lines.reduce((s, l) => s + l.amount, 0));
  return { lines, total, issues };
}

/**
 * Slide: the projection is fixed by the louvre count — each row of the price list is made only within its
 * "projection range" (Slide p.5–9, about 230 mm per louvre, each range 40 mm wide).
 * ASSUMPTION: a projection between two ranges is built at the nearest range (on a tie the longer one), because the
 * catalogue's own row labels do the same (row "6500" is made 6447–6487, row "4500" 4602–4642). A projection more
 * than half a louvre pitch outside the first / last range is not made.
 */
export const SLIDE_MAX_SNAP = 115;
export function slideProjection(table: { meta?: Record<string, unknown> }, projection: number): { built: number; range: [number, number]; index: number } {
  const ranges = table.meta?.projectionRanges as [number, number][] | undefined;
  if (!ranges) throw new Error('slide table without projection ranges');
  let index = -1, best = Infinity;
  ranges.forEach((r, i) => {
    const d = projection < r[0] ? r[0] - projection : projection > r[1] ? projection - r[1] : 0;
    if (d <= best) { best = d; index = i; }
  });
  if (best > SLIDE_MAX_SNAP) throw new OutOfRangeError('y', projection, ranges[0]![0] - SLIDE_MAX_SNAP, ranges.at(-1)![1] + SLIDE_MAX_SNAP);
  const range = ranges[index]!;
  return { built: Math.min(Math.max(projection, range[0]), range[1]), range, index };
}

/** Slide: projection above 6000 mm needs an additional (intermediate) supporting post (Slide p.5–8). */
export const SLIDE_POST_FREE_PROJECTION = 6000;

/**
 * Pergola coating surcharge in %. Rates are [construction, roof, whole].
 * One colour on construction and roof -> the 'whole' rate (e.g. S400 fine: 8%, not 5% + 7%).
 * ASSUMPTION: two different colours (even of the same group) are two coatings -> construction + roof rates.
 */
export function coatingPercent(model: PergolaModel, color: PergolaColor, cat: Catalog): number {
  const table = cat.coating.rates[model];
  if (!table) throw new Error(`no coating rates for ${model}`);
  const r = (g: ColorGroup) => {
    const v = table[g];
    if (!Array.isArray(v)) throw new Error(`coating rate ${model}.${g} must be [construction, roof, whole]`);
    return v;
  };
  // 'whole' = one colour on the whole pergola. Without colour ids, the same group counts as one colour.
  if (color.same ?? color.construction === color.roof) return r(color.construction)[2];
  return r(color.construction)[0] + r(color.roof)[1];
}
