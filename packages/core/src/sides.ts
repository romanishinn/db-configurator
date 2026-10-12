import { lookupGrid, NotProducedError, OutOfRangeError } from './grid';
import { round2 } from './money';
import type { Catalog, GridTable, Issue, Line } from './types';

/**
 * Win Verto (vertical aluminium profiles) and Win Panels (slatted panels) in a pergola opening.
 * Catalogues: Win Verto 07.2026 p.6, Win Panels 07.2026 p.6 (standard colours) / p.7 (wood-like colours).
 */

// ---------- Win Verto ----------
export interface VertoResult {
  ok: boolean;
  profiles: number;
  /** gap between profiles when spread over the opening, mm */
  spacing: number;
  billedHeight: number;
  lines: Line[];
  total: number;
  issues: Issue[];
}

const RECOMMENDED_SPACING = 55;
const PROFILE = 35;

/**
 * Profiles spread over the whole opening; the count is chosen so the gap is closest to the recommended 55 mm
 * (package width = 90·N − 55). Above 40 profiles: the 40-profile price + the additional profile price.
 * ASSUMPTION: profile length = opening height (installation in the recess between the posts, p.5).
 */
export function priceVerto(width: number, height: number, cat: Catalog): VertoResult {
  const t = cat.tables['verto.profiles'] as GridTable & { meta: { additionalProfile: number[]; packageWidth: number[] } };
  const issues: Issue[] = [];
  const n = Math.max(5, Math.round((width + RECOMMENDED_SPACING) / (PROFILE + RECOMMENDED_SPACING)));
  const spacing = Math.round((width - n * PROFILE) / (n - 1));
  let base: { price: number; y: number } | null = null;
  try {
    const g = lookupGrid(t, Math.min(n, 40), height);
    base = { price: g.price, y: g.y };
  } catch (e) {
    if (e instanceof OutOfRangeError) {
      issues.push({ severity: 'block', code: 'VERTO_HEIGHT_OUT_OF_RANGE', params: { value: height, min: e.min, max: e.max } });
      return { ok: false, profiles: n, spacing, billedHeight: 0, lines: [], total: 0, issues };
    }
    throw e;
  }
  const yi = t.y.values.indexOf(base.y);
  const extra = Math.max(0, n - 40);
  const lines: Line[] = [{ code: 'VERTO_PACKAGE', params: { profiles: Math.min(n, 40), height: base.y, spacing }, amount: base.price, source: { file: t.source.file, page: t.source.page, table: t.id } }];
  if (extra) lines.push({ code: 'VERTO_ADDITIONAL', params: { profiles: extra, unit: t.meta.additionalProfile[yi]! }, amount: extra * t.meta.additionalProfile[yi]!, source: { file: t.source.file, page: t.source.page } });
  return { ok: true, profiles: n, spacing, billedHeight: base.y, lines, total: round2(lines.reduce((s, l) => s + l.amount, 0)), issues };
}

export function vertoCornerPrice(cat: Catalog): number {
  return (cat.tables['verto.profiles']!.meta as { cornerConnection: number }).cornerConnection;
}

// ---------- Win Panels ----------
export type PanelSlats = 'fixed' | 'rotating';
export type PanelMount = 'sliding' | 'fixed';

export interface PanelsRequest {
  width: number;
  height: number;
  slats?: PanelSlats;
  mount?: PanelMount;
  /** wood-like colour -> price lists 3/4 and the wood rail table */
  wood?: boolean;
  /** slim rails instead of standard */
  slim?: boolean;
}

export interface PanelsResult {
  ok: boolean;
  panels: number;
  panelWidth: number;
  tracks: number;
  billed: { width: number; height: number } | null;
  lines: Line[];
  total: number;
  /** catalogue price before coating (coating % base) */
  issues: Issue[];
}

export const PANEL_MAX_WIDTH = 1800;
/** ASSUMPTION: neighbouring sliding panels overlap by 60 mm (one track) so the opening stays closed. */
export const PANEL_OVERLAP = 60;
const MAX_TRACKS = 3;

export function pricePanels(req: PanelsRequest, cat: Catalog): PanelsResult {
  const slats = req.slats ?? 'fixed', mount = req.mount ?? 'sliding', colour = req.wood ? 'wood' : 'std';
  const t = cat.tables[`panels.${slats}.${colour}`] as GridTable & { meta: { stopper: number; frameConnector: number } };
  const rail = cat.tables[`panels.rail.${colour}`] as GridTable & { meta: { rows: { tracks: number; slim: boolean }[] } };
  const issues: Issue[] = [];
  const overlap = mount === 'sliding' ? PANEL_OVERLAP : 0;
  let n = Math.max(1, Math.ceil(req.width / PANEL_MAX_WIDTH));
  const pw = (k: number) => Math.ceil((req.width + (k - 1) * overlap) / k);
  while (pw(n) > PANEL_MAX_WIDTH) n++;
  // sliding: up to 3 panels on their own tracks stack to one side; more panels part to both sides
  const tracks = mount === 'sliding' ? (n <= MAX_TRACKS ? n : Math.ceil(n / 2)) : 0;
  const fail = (code: string, params: Record<string, number | string>) => {
    issues.push({ severity: 'block', code, params });
    return { ok: false, panels: n, panelWidth: pw(n), tracks, billed: null, lines: [], total: 0, issues };
  };
  if (tracks > MAX_TRACKS) return fail('PANELS_TOO_MANY', { panels: n, maxTracks: MAX_TRACKS });
  let g;
  try {
    g = lookupGrid(t, Math.max(pw(n), t.x.values[0]!), req.height);
  } catch (e) {
    if (e instanceof OutOfRangeError) return fail('PANELS_SIZE_OUT_OF_RANGE', { axis: e.axis === 'x' ? 'width' : 'height', value: e.value, min: e.min, max: e.max });
    if (e instanceof NotProducedError) return fail('PANELS_NOT_PRODUCED', { width: e.x, height: e.y });
    throw e;
  }
  const lines: Line[] = [{ code: 'PANELS', params: { panels: n, slats, colour, width: g.x, height: g.y, unit: g.price }, amount: g.price * n, source: g.source }];
  if (mount === 'sliding') {
    const variant = rail.meta.rows.findIndex((r) => r.tracks === tracks && r.slim === !!req.slim) + 1;
    try {
      const r = lookupGrid(rail, req.width, variant);
      lines.push({ code: 'PANELS_RAIL', params: { tracks, slim: req.slim ? 1 : 0, width: r.x }, amount: r.price, source: r.source });
    } catch (e) {
      if (e instanceof OutOfRangeError) return fail('PANELS_RAIL_OUT_OF_RANGE', { value: req.width, max: rail.x.values.at(-1)! });
      throw e;
    }
  } else if (n > 1) {
    // fixed panels side by side: frame connectors, 3 recommended per joint (p.6)
    const qty = (n - 1) * 3;
    lines.push({ code: 'PANELS_CONNECTORS', params: { qty, unit: t.meta.frameConnector }, amount: qty * t.meta.frameConnector, source: { file: t.source.file, page: t.source.page } });
  }
  return { ok: true, panels: n, panelWidth: pw(n), tracks, billed: { width: g.x, height: g.y }, lines, total: round2(lines.reduce((s, l) => s + l.amount, 0)), issues };
}
