import { pricePergola, type Mount } from './pergola';
import { round2 } from './money';
import type { Catalog, Issue } from './types';

/**
 * Composer: covers a terrace of any size with one or more pergola modules and ranks the options.
 *
 * Geometry convention (same as the catalogue): width runs along the wall (louvre length),
 * depth = projection (louvres are stacked along it, so depth is tied to the louvre pitch).
 */
export type LouvreDirection = 'parallel' | 'perpendicular';

export interface TerraceRequest {
  mount: Mount;
  /** along the wall (freestanding: the front side), mm */
  width: number;
  depth: number;
  /**
   * Louvres relative to the wall. 'parallel' (default): louvre length runs along the wall.
   * 'perpendicular': louvres run from the wall to the front, louvre length = terrace depth.
   * Same price tables for both: S400 wall table is titled "PARALLEL / PERPENDICULAR LOUVRES" (S400 p.13),
   * S500 wall drawings show the wall on either side (types B/C, S500 p.14).
   */
  louvres?: LouvreDirection;
}

export type Family = 'S400' | 'S500' | 'S500_DOUBLE';

export interface PlacedModule {
  family: Family;
  /** 0-based column (along the terrace width) and row (along the depth, row 0 at the wall) */
  col: number;
  row: number;
  /** offset of the module's left/back corner from the terrace corner, mm */
  x: number;
  y: number;
  /** size in terrace axes: width along the wall, depth away from it */
  width: number;
  depth: number;
  /** catalogue axes: louvre length (catalogue "width") and projection (louvre count) */
  louvreLength: number;
  projection: number;
  /** terrace axis the louvres run along */
  louvreAxis: 'x' | 'y';
  /** price table mount actually used (S400 away from the wall = freestanding pergola) */
  mount: Mount;
  role: 'single' | 'base' | 'add';
  price: number;
  /** grid price without surcharges (base for the coating percentage) */
  gridPrice: number;
  table: string;
}

export interface Composition {
  family: Family;
  label: string;
  louvres: LouvreDirection;
  modules: PlacedModule[];
  cols: number;
  rows: number;
  /** built size; may exceed the request when it has to snap to the louvre grid */
  width: number;
  depth: number;
  total: number;
  posts: number;
  equalWidths: boolean;
  issues: Issue[];
  /** why this option is shown: cheapest, equal modules, fewest modules */
  tags: string[];
}

interface FamilySpec {
  family: Family;
  label: string;
  widths: number[]; // price-grid steps of the louvre length (catalogue width)
  minWidth: number;
  maxDepth: number;
  minDepth: number;
  depthStep: number | null; // null = any projection (individual projection surcharge applies)
  gridStep: number; // projection grid of the price table
  modular: boolean; // shares posts at joints (S500) or stands as separate pergolas (S400)
}

const SPECS: FamilySpec[] = [
  { family: 'S400', label: 'S400', widths: [2000, 2500, 3000, 3500, 4000, 4500], minWidth: 2000, maxDepth: 7000, minDepth: 2000, depthStep: 200, gridStep: 200, modular: false },
  { family: 'S500', label: 'S500', widths: [2000, 2250, 2500, 3000, 3250, 3500, 3750, 4000, 4250, 4500, 5000], minWidth: 2000, maxDepth: 8000, minDepth: 2000, depthStep: null, gridStep: 250, modular: true },
  { family: 'S500_DOUBLE', label: 'S500 двойная', widths: [5500, 5950, 6500, 6950], minWidth: 5500, maxDepth: 7000, minDepth: 2000, depthStep: null, gridStep: 250, modular: true },
];

const MAX_EXTRA_MODULES = 2; // also try n+1, n+2 modules beyond the minimum
const MAX_GRID = 4; // catalogue shows S500 configurations up to 4 × 4 modules

function priceModule(spec: FamilySpec, mount: Mount, role: PlacedModule['role'], width: number, depth: number, cat: Catalog) {
  const model = spec.family === 'S400' ? 'S400' : 'S500';
  const layout = spec.family === 'S500_DOUBLE' ? 'double' : 'single';
  const module = role === 'add' ? 'add' : 'base';
  return pricePergola({ model, mount, layout, module: model === 'S500' ? module : undefined, width, projection: depth }, cat);
}

/** Support posts, counted in terrace axes (row 0 is at the wall). */
function countPosts(spec: FamilySpec, mount: Mount, modules: PlacedModule[], cols: number, rows: number): number {
  if (mount === 'roof') return 0;
  if (spec.modular) return (cols + 1) * (rows + (mount === 'free' ? 1 : 0)); // shared posts on every grid line
  // S400: every pergola stands on its own; at the wall it hangs on brackets and needs 2 posts, otherwise 4
  return modules.reduce((a, m) => a + (m.mount === 'wall' ? 2 : 4), 0);
}

/** Split a length into n parts that each fit [min, max] of the price grid, as evenly as possible. */
function splitEven(total: number, n: number, min: number, max: number, step = 10): number[] | null {
  const k = Math.round(total / step);
  if (k * step !== total) return null;
  const q = Math.floor(k / n), r = k % n;
  const parts = Array.from({ length: n }, (_, i) => (q + (i < r ? 1 : 0)) * step);
  if (parts.some((p) => p < min || p > max)) return null;
  return parts;
}

/** All multisets of grid steps with n items whose sum covers the length; actual widths then shrink to fit exactly. */
function stepCombos(steps: number[], n: number, total: number, min: number): number[][] {
  const out: number[][] = [];
  const rec = (start: number, acc: number[]) => {
    if (acc.length === n) {
      const sum = acc.reduce((a, b) => a + b, 0);
      if (sum >= total && n * min <= total) out.push([...acc]);
      return;
    }
    for (let i = start; i < steps.length; i++) rec(i, [...acc, steps[i]!]);
  };
  rec(0, []);
  return out;
}

/** Multisets of n grid values in [min, max] that sum exactly to the length (largest first). */
function exactCombos(min: number, max: number, step: number, n: number, total: number): number[][] {
  const out: number[][] = [];
  const rec = (hi: number, left: number, k: number, acc: number[]) => {
    if (k === 0) { if (left === 0) out.push([...acc]); return; }
    for (let v = Math.min(hi, left - (k - 1) * min); v >= min; v -= step) {
      if (v * k < left) break;
      rec(v, left - v, k - 1, [...acc, v]);
    }
  };
  rec(Math.floor(max / step) * step, total, n, []);
  return out;
}

/** Fit actual widths into chosen steps: shrink the largest modules first, never below the minimum. */
function fitToSteps(steps: number[], total: number, min: number): number[] | null {
  const widths = [...steps].sort((a, b) => b - a);
  let excess = widths.reduce((a, b) => a + b, 0) - total;
  for (let i = 0; i < widths.length && excess > 0; i++) {
    const room = widths[i]! - min;
    const cut = Math.min(room, excess);
    widths[i] = widths[i]! - cut;
    excess -= cut;
  }
  return excess === 0 ? widths : null;
}

/** Louvre-length axis: candidate splits (each part priced at the next width step). */
function lengthSplits(spec: FamilySpec, total: number): number[][] {
  const maxW = spec.widths.at(-1)!;
  const nMin = Math.max(1, Math.ceil(total / maxW));
  const out: number[][] = [];
  for (let n = nMin; n <= Math.min(nMin + MAX_EXTRA_MODULES, MAX_GRID * 2); n++) {
    if (spec.modular && n > MAX_GRID) continue;
    for (const c of stepCombos(spec.widths, n, total, spec.minWidth)) {
      const fitted = fitToSteps(c, total, spec.minWidth);
      if (fitted) out.push(fitted);
    }
    const even = splitEven(total, n, spec.minWidth, maxW);
    if (even) out.push(even);
  }
  return out;
}

/** Projection axis: snap to the louvre pitch where required, then candidate splits. */
function projectionSplits(spec: FamilySpec, total: number): { splits: number[][]; built: number; issues: Issue[] } | null {
  const issues: Issue[] = [];
  let d = total;
  if (spec.depthStep && d % spec.depthStep !== 0) {
    const snapped = Math.ceil(d / spec.depthStep) * spec.depthStep;
    issues.push({ severity: 'warn', code: 'DEPTH_SNAPPED', params: { requested: d, built: snapped, step: spec.depthStep } });
    d = snapped;
  }
  if (d < spec.minDepth) return null;
  const nMin = Math.ceil(d / spec.maxDepth);
  if (nMin > MAX_GRID) return null;
  if (nMin > 1 && spec.family === 'S500_DOUBLE') return null; // double modules join only along the louvre length
  const splits: number[][] = [];
  for (let n = nMin; n <= Math.min(nMin + 1, MAX_GRID); n++) {
    if (n > 1 && spec.family === 'S500_DOUBLE') break;
    const even = splitEven(d, n, spec.minDepth, spec.maxDepth, spec.depthStep ?? 10);
    if (even) splits.push(even);
    if (n > 1 && n <= 3 && d % spec.gridStep === 0) splits.push(...exactCombos(spec.minDepth, spec.maxDepth, spec.gridStep, n, d));
  }
  return splits.length ? { splits, built: d, issues } : null;
}

export function compose(req: TerraceRequest, cat: Catalog): { options: Composition[]; suggestions: Issue[] } {
  const louvres: LouvreDirection = req.louvres ?? 'parallel';
  // catalogue frame: u = louvre length (catalogue width), v = projection (louvres stacked along it)
  const uLen = louvres === 'parallel' ? req.width : req.depth;
  const vLen = louvres === 'parallel' ? req.depth : req.width;
  const all: Composition[] = [];
  for (const spec of SPECS) {
    const ps = projectionSplits(spec, vLen);
    if (!ps) continue;
    const seenV = new Set<string>();
    for (const vParts of ps.splits) {
      const vKey = [...vParts].sort((a, b) => a - b).join(',');
      if (seenV.has(vKey)) continue;
      seenV.add(vKey);
      for (const uParts of lengthSplits(spec, uLen)) {
        const comp = build(spec, req, louvres, uParts, vParts, ps.issues, cat);
        if (comp) all.push(comp);
      }
    }
  }
  const options = rank(all);
  const suggestions = options.length ? [] : suggest(req);
  return { options, suggestions };
}

function build(spec: FamilySpec, req: TerraceRequest, louvres: LouvreDirection, uParts: number[], vParts: number[], issues: Issue[], cat: Catalog): Composition | null {
  if (!spec.modular) return buildWithBase(spec, req, louvres, uParts, vParts, issues, cat, -1);
  // The base module costs more than an additional one; make the base the module where that premium is smallest.
  let best: Composition | null = null;
  const tried = new Set<number>();
  uParts.forEach((w, c) => {
    if (tried.has(w)) return;
    tried.add(w);
    const comp = buildWithBase(spec, req, louvres, uParts, vParts, issues, cat, c);
    if (comp && (!best || comp.total < best.total)) best = comp;
  });
  return best;
}

function buildWithBase(spec: FamilySpec, req: TerraceRequest, louvres: LouvreDirection, uParts: number[], vParts: number[], issues: Issue[], cat: Catalog, baseCol: number): Composition | null {
  const par = louvres === 'parallel';
  const modules: PlacedModule[] = [];
  let total = 0;
  const allIssues = [...issues];
  let v0 = 0;
  vParts.forEach((projection, vi) => {
    let u0 = 0;
    uParts.forEach((louvreLength, ui) => {
      const role: PlacedModule['role'] = !spec.modular ? 'single' : vi === 0 && ui === baseCol ? 'base' : 'add';
      const col = par ? ui : vi, row = par ? vi : ui;
      // ASSUMPTION: S400 pergolas away from the wall are priced as freestanding; S500 additional modules
      // keep the mount's tables (catalogue shows such grids, prices per module) — to confirm with Sun Winner.
      const mount: Mount = req.mount === 'wall' && row > 0 && !spec.modular ? 'free' : req.mount;
      const p = priceModule(spec, mount, role, louvreLength, projection, cat);
      if (p.issues.some((i) => i.severity === 'block')) allIssues.push(...p.issues.filter((i) => i.severity === 'block'));
      total += p.total;
      modules.push({
        family: spec.family, col, row,
        x: par ? u0 : v0, y: par ? v0 : u0,
        width: par ? louvreLength : projection, depth: par ? projection : louvreLength,
        louvreLength, projection, louvreAxis: par ? 'x' : 'y', mount,
        role, price: p.total, gridPrice: p.lines[0]?.amount ?? 0, table: String(p.lines[0]?.params?.table ?? ''),
      });
      u0 += louvreLength;
    });
    v0 += projection;
  });
  if (allIssues.some((i) => i.severity === 'block')) return null;
  modules.sort((a, b) => a.row - b.row || a.col - b.col);
  const cols = par ? uParts.length : vParts.length;
  const rows = par ? vParts.length : uParts.length;
  if (spec.modular && vParts.length > 1) allIssues.push({ severity: 'info', code: 'MULTI_ROW_ASSUMPTION' });
  if (!spec.modular && modules.length > 1) allIssues.push({ severity: 'info', code: 'SEPARATE_PERGOLAS', params: { count: modules.length } });
  if (!spec.modular && req.mount === 'wall' && rows > 1) allIssues.push({ severity: 'info', code: 'S400_FREE_ROWS' });
  const lens = modules.filter((m) => m.row === 0).map((m) => m.width);
  const equal = lens.every((w) => Math.abs(w - lens[0]!) <= 10);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    family: spec.family,
    label: spec.label,
    louvres,
    modules,
    cols,
    rows,
    width: par ? sum(uParts) : sum(vParts),
    depth: par ? sum(vParts) : sum(uParts),
    total: round2(total),
    posts: countPosts(spec, req.mount, modules, cols, rows),
    equalWidths: equal,
    issues: allIssues,
    tags: [],
  };
}

const key = (c: Composition) => `${c.family}|${c.louvres}|${c.modules.map((m) => `${m.row}:${m.width}x${m.depth}`).sort().join(',')}`;

/** Keep the useful few: cheapest overall, cheapest per family, cheapest with equal modules, fewest modules. */
function rank(all: Composition[]): Composition[] {
  const uniq = new Map<string, Composition>();
  for (const c of all) if (!uniq.has(key(c))) uniq.set(key(c), c);
  const list = [...uniq.values()].sort((a, b) => a.total - b.total || a.modules.length - b.modules.length);
  if (!list.length) return [];
  const picked = new Map<string, Composition>();
  const add = (c: Composition | undefined, tag: string) => {
    if (!c) return;
    const k = key(c);
    const existing = picked.get(k) ?? c;
    existing.tags = [...new Set([...existing.tags, tag])];
    picked.set(k, existing);
  };
  add(list[0], 'cheapest');
  add(list.find((c) => c.equalWidths), 'equal');
  const fewest = Math.min(...list.map((c) => c.modules.length));
  add(list.find((c) => c.modules.length === fewest), 'fewest');
  for (const fam of ['S400', 'S500', 'S500_DOUBLE'] as Family[]) add(list.find((c) => c.family === fam), 'family');
  return [...picked.values()].sort((a, b) => a.total - b.total);
}

/** Nothing fits: say why and offer the nearest buildable sizes. */
function suggest(req: TerraceRequest): Issue[] {
  const out: Issue[] = [];
  if (req.depth < 2000) out.push({ severity: 'block', code: 'DEPTH_TOO_SMALL', params: { requested: req.depth, suggested: 2000 } });
  if (req.width < 2000) out.push({ severity: 'block', code: 'WIDTH_TOO_SMALL', params: { requested: req.width, suggested: 2000 } });
  const maxDepth = MAX_GRID * 8000;
  if (req.depth > maxDepth) out.push({ severity: 'block', code: 'DEPTH_TOO_LARGE', params: { requested: req.depth, suggested: maxDepth } });
  const maxWidth = MAX_GRID * 2 * 6950;
  if (req.width > maxWidth) out.push({ severity: 'block', code: 'WIDTH_TOO_LARGE', params: { requested: req.width, suggested: maxWidth } });
  if (!out.length) out.push({ severity: 'block', code: 'NO_COMBINATION' });
  return out;
}
