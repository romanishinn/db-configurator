import { pricePergola, type Mount } from './pergola';
import { round2 } from './money';
import type { Catalog, Issue } from './types';

/**
 * Composer: covers a terrace of any size with one or more pergola modules and ranks the options.
 *
 * Geometry convention (same as the catalogue): width runs along the wall (louvre length),
 * depth = projection (louvres are stacked along it, so depth is tied to the louvre pitch).
 */
export interface TerraceRequest {
  mount: Mount;
  width: number;
  depth: number;
}

export type Family = 'S400' | 'S500' | 'S500_DOUBLE';

export interface PlacedModule {
  family: Family;
  /** 0-based column (along the width) and row (along the depth) */
  col: number;
  row: number;
  /** offset of the module's left/back corner from the terrace corner, mm */
  x: number;
  y: number;
  width: number;
  depth: number;
  role: 'single' | 'base' | 'add';
  price: number;
  table: string;
}

export interface Composition {
  family: Family;
  label: string;
  modules: PlacedModule[];
  cols: number;
  rows: number;
  /** built depth (may differ from the request when the depth has to snap to the louvre grid) */
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
  widths: number[]; // price-grid steps along the width
  minWidth: number;
  maxDepth: number;
  minDepth: number;
  depthStep: number | null; // null = any depth (individual projection surcharge applies)
  modular: boolean; // shares posts at joints (S500) or stands as separate pergolas (S400)
}

const SPECS: FamilySpec[] = [
  { family: 'S400', label: 'S400', widths: [2000, 2500, 3000, 3500, 4000, 4500], minWidth: 2000, maxDepth: 7000, minDepth: 2000, depthStep: 200, modular: false },
  { family: 'S500', label: 'S500', widths: [2000, 2250, 2500, 3000, 3250, 3500, 3750, 4000, 4250, 4500, 5000], minWidth: 2000, maxDepth: 8000, minDepth: 2000, depthStep: null, modular: true },
  { family: 'S500_DOUBLE', label: 'S500 двойная', widths: [5500, 5950, 6500, 6950], minWidth: 5500, maxDepth: 7000, minDepth: 2000, depthStep: null, modular: true },
];

const MAX_EXTRA_MODULES = 2; // also try n+1, n+2 modules beyond the minimum
const MAX_GRID = 4; // catalogue shows S500 configurations up to 4 × 4 modules

function priceModule(spec: FamilySpec, mount: Mount, role: PlacedModule['role'], width: number, depth: number, cat: Catalog) {
  const model = spec.family === 'S400' ? 'S400' : 'S500';
  const layout = spec.family === 'S500_DOUBLE' ? 'double' : 'single';
  const module = role === 'add' ? 'add' : 'base';
  const r = pricePergola({ model, mount, layout, module: model === 'S500' ? module : undefined, width, projection: depth }, cat);
  return r;
}

/** Posts (support columns) for a row of modules — catalogue headings per table. */
function countPosts(spec: FamilySpec, mount: Mount, cols: number, rows: number): number {
  if (mount === 'roof') return 0;
  const perRowLine = spec.modular ? cols + 1 : cols * 2; // S400: separate pergolas, double posts at joints
  const lines = mount === 'free' ? rows + 1 : rows; // wall: back line hangs on the wall
  return perRowLine * lines;
}

/** Split a length into n parts that each fit [min, max] of the price grid, as evenly as possible. */
function splitEven(total: number, n: number, min: number, max: number): number[] | null {
  const w = total / n;
  if (w < min || w > max) return null;
  const base = Math.floor(w / 10) * 10; // keep whole centimetres
  const parts = Array(n).fill(base) as number[];
  parts[n - 1] = total - base * (n - 1);
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

function splitDepth(spec: FamilySpec, depth: number): { rows: number[]; issues: Issue[] } | null {
  const issues: Issue[] = [];
  let d = depth;
  if (spec.depthStep && d % spec.depthStep !== 0) {
    const snapped = Math.ceil(d / spec.depthStep) * spec.depthStep;
    issues.push({ severity: 'warn', code: 'DEPTH_SNAPPED', params: { requested: d, built: snapped, step: spec.depthStep } });
    d = snapped;
  }
  if (d < spec.minDepth) return null;
  const nRows = Math.ceil(d / spec.maxDepth);
  if (nRows > MAX_GRID) return null;
  if (nRows > 1 && spec.family !== 'S500') return null; // only S500 single modules join in depth
  const rows = splitEven(d, nRows, spec.minDepth, spec.maxDepth);
  if (!rows) return null;
  return { rows, issues };
}

export function compose(req: TerraceRequest, cat: Catalog): { options: Composition[]; suggestions: Issue[] } {
  const all: Composition[] = [];
  for (const spec of SPECS) {
    const ds = splitDepth(spec, req.depth);
    if (!ds) continue;
    const maxW = spec.widths.at(-1)!;
    const nMin = Math.max(1, Math.ceil(req.width / maxW));
    for (let n = nMin; n <= Math.min(nMin + MAX_EXTRA_MODULES, MAX_GRID * 2); n++) {
      if (spec.modular && n > MAX_GRID) continue;
      const candidates: number[][] = [];
      for (const c of stepCombos(spec.widths, n, req.width, spec.minWidth)) {
        const fitted = fitToSteps(c, req.width, spec.minWidth);
        if (fitted) candidates.push(fitted);
      }
      const even = splitEven(req.width, n, spec.minWidth, maxW);
      if (even) candidates.push(even);
      for (const widths of candidates) {
        const comp = build(spec, req, widths, ds.rows, ds.issues, cat);
        if (comp) all.push(comp);
      }
    }
  }
  const options = rank(all);
  const suggestions = options.length ? [] : suggest(req);
  return { options, suggestions };
}

function build(spec: FamilySpec, req: TerraceRequest, widths: number[], rows: number[], issues: Issue[], cat: Catalog): Composition | null {
  if (!spec.modular) return buildWithBase(spec, req, widths, rows, issues, cat, -1);
  // The base module costs more than an additional one; make the base the module where that premium is smallest.
  let best: Composition | null = null;
  const tried = new Set<number>();
  widths.forEach((w, c) => {
    if (tried.has(w)) return;
    tried.add(w);
    const comp = buildWithBase(spec, req, widths, rows, issues, cat, c);
    if (comp && (!best || comp.total < best.total)) best = comp;
  });
  return best;
}

function buildWithBase(spec: FamilySpec, req: TerraceRequest, widths: number[], rows: number[], issues: Issue[], cat: Catalog, baseCol: number): Composition | null {
  const modules: PlacedModule[] = [];
  let y = 0;
  let total = 0;
  const allIssues = [...issues];
  rows.forEach((depth, r) => {
    let x = 0;
    widths.forEach((width, c) => {
      const role: PlacedModule['role'] = !spec.modular ? 'single' : r === 0 && c === baseCol ? 'base' : 'add';
      const p = priceModule(spec, req.mount, role, width, depth, cat);
      if (p.issues.some((i) => i.severity === 'block')) {
        allIssues.push(...p.issues.filter((i) => i.severity === 'block'));
      }
      total += p.total;
      modules.push({ family: spec.family, col: c, row: r, x, y, width, depth, role, price: p.total, table: String(p.lines[0]?.params?.table ?? '') });
      x += width;
    });
    y += depth;
  });
  if (allIssues.some((i) => i.severity === 'block')) return null;
  // ASSUMPTION: multi-row S500 uses the same mount tables for every row (catalogue shows such grids, prices per module).
  if (rows.length > 1) allIssues.push({ severity: 'info', code: 'MULTI_ROW_ASSUMPTION' });
  if (!spec.modular && widths.length > 1) allIssues.push({ severity: 'info', code: 'SEPARATE_PERGOLAS', params: { count: widths.length } });
  const equal = widths.every((w) => Math.abs(w - widths[0]!) <= 10);
  return {
    family: spec.family,
    label: spec.label,
    modules,
    cols: widths.length,
    rows: rows.length,
    depth: rows.reduce((a, b) => a + b, 0),
    total: round2(total),
    posts: countPosts(spec, req.mount, widths.length, rows.length),
    equalWidths: equal,
    issues: allIssues,
    tags: [],
  };
}

const key = (c: Composition) => `${c.family}|${c.modules.map((m) => `${m.width}x${m.depth}`).sort().join(',')}`;

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
