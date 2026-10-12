import { fabricSurcharge } from './colors';
import { lookupGrid, NotProducedError, OutOfRangeError } from './grid';
import { round2 } from './money';
import type { Catalog, ControlItem, GridTable, Issue, Line, ScreenMotor } from './types';

/**
 * Win Screen ZIP on a pergola side: adaptive box mounted in the opening.
 * Catalogue price = screen with Soltis 7635, standard colour, brackets, bottom bar (Win Screen p.21/24, "standard price includes").
 * Extra: motor (WIN CONTROL, p.47, chosen by the torque zone of the size), fabric collection €/m², colour %.
 */
export type ScreenSystem = 'zip110.adaptive' | 'zip130.adaptive';
export const SCREEN_SYSTEMS: ScreenSystem[] = ['zip110.adaptive', 'zip130.adaptive'];
export type MotorControl = 'wired' | 'radio' | 'solar';

export interface ScreenRequest {
  width: number;
  height: number;
  /** fabric collection id (fabrics.json), default Soltis 7635 (in price) */
  fabric?: string;
  control?: MotorControl;
  /** omit to take the cheapest system that builds this size with this fabric */
  system?: ScreenSystem;
}

interface ScreenMeta {
  torqueNm: (number | null)[][];
  collectionLimits: ({ type: 'maxHeight'; maxHeight: number; widths: number[]; collections: string[] } | { type: 'maxWidth'; maxWidth: number; collections: string[] })[];
}

export interface ScreenOption {
  system: ScreenSystem;
  billed: { width: number; height: number };
  /** catalogue price of the screen (coating % base) */
  gridPrice: number;
  torqueNm: number;
  motor: ScreenMotor;
  lines: Line[];
  total: number;
}

export interface ScreenResult {
  best: ScreenOption | null;
  options: ScreenOption[];
  issues: Issue[];
}

const DEFAULT_FABRIC = 'soltis-7635';

export function priceScreenIn(system: ScreenSystem, req: ScreenRequest, cat: Catalog): { option: ScreenOption | null; issues: Issue[] } {
  const t = cat.tables[system] as (GridTable & { meta: ScreenMeta }) | undefined;
  if (!t) throw new Error(`price table ${system} missing in ${cat.version}`);
  const fabric = req.fabric ?? DEFAULT_FABRIC;
  const issues: Issue[] = [];
  let g;
  try {
    g = lookupGrid(t, req.width, req.height);
  } catch (e) {
    if (e instanceof OutOfRangeError) {
      issues.push({ severity: 'block', code: 'SCREEN_SIZE_OUT_OF_RANGE', params: { system, axis: e.axis === 'x' ? 'width' : 'height', value: e.value, min: e.min, max: e.max } });
      return { option: null, issues };
    }
    if (e instanceof NotProducedError) {
      issues.push({ severity: 'block', code: 'SCREEN_NOT_PRODUCED', params: { system, width: e.x, height: e.y } });
      return { option: null, issues };
    }
    throw e;
  }
  for (const l of t.meta.collectionLimits) {
    if (!l.collections.includes(fabric)) continue;
    if (l.type === 'maxHeight' && l.widths.includes(g.x) && g.y > l.maxHeight) {
      issues.push({ severity: 'block', code: 'FABRIC_MAX_HEIGHT', params: { system, fabric, maxHeight: l.maxHeight } });
    }
    if (l.type === 'maxWidth' && g.x > l.maxWidth) {
      issues.push({ severity: 'block', code: 'FABRIC_MAX_WIDTH', params: { system, fabric, maxWidth: l.maxWidth } });
    }
  }
  if (issues.length) return { option: null, issues };

  const xi = t.x.values.indexOf(g.x), yi = t.y.values.indexOf(g.y);
  const nm = t.meta.torqueNm[yi]![xi]!;
  const control = req.control ?? 'wired';
  const motors = (cat.screenMotors?.motors ?? []).filter((m) => m.control === control && m.nm >= nm && m.minWidth.adaptive <= req.width).sort((a, b) => a.price - b.price || a.nm - b.nm);
  const motor = motors[0];
  if (!motor) {
    issues.push({ severity: 'block', code: 'SCREEN_NO_MOTOR', params: { system, torque: nm, control } });
    return { option: null, issues };
  }
  const lines: Line[] = [
    { code: 'SCREEN_BASE', params: { system, width: g.x, height: g.y }, amount: g.price, source: g.source },
    { code: 'SCREEN_MOTOR', params: { index: motor.index, nm: motor.nm, required: nm, control }, amount: motor.price, source: { file: cat.screenMotors!.source.file, page: cat.screenMotors!.source.page } },
  ];
  const f = fabricSurcharge(req.width, req.height, fabric, cat);
  if (f.amount > 0) lines.push(f);
  return {
    option: { system, billed: { width: g.x, height: g.y }, gridPrice: g.price, torqueNm: nm, motor, lines, total: round2(lines.reduce((s, l) => s + l.amount, 0)) },
    issues,
  };
}

/** Cheapest ZIP system that builds the opening with the chosen fabric; issues explain why not when none does. */
export function selectScreen(req: ScreenRequest, cat: Catalog): ScreenResult {
  const options: ScreenOption[] = [];
  const issues: Issue[] = [];
  for (const s of req.system ? [req.system] : SCREEN_SYSTEMS) {
    const r = priceScreenIn(s, req, cat);
    if (r.option) options.push(r.option);
    else issues.push(...r.issues);
  }
  options.sort((a, b) => a.total - b.total);
  return { best: options[0] ?? null, options, issues: options.length ? [] : issues };
}

/**
 * How a screen is operated. Each mode fixes the motor type and the shared control devices:
 * - remote:  WIN CONTROL 2-way radio motor + one handheld/wall remote for the project
 * - smart:   WIN CONTROL 2-way radio motor + one WIN CONTROL Smart unit (smartphone app, ZigBee 3.0)
 * - pergola: WIN CONTROL wired motor + TELECO central unit -> operated with the pergola's 63-channel remote
 *            (S400 p.20 / S500 p.45: unit for 1 motor or for 4 motors, the 4-motor unit has a wind sensor input)
 * - solar:   WIN CONTROL solar radio motor kit with panel (20 Nm) + remote
 */
export type ScreenControlMode = 'remote' | 'smart' | 'pergola' | 'solar';
export const MOTOR_FOR_MODE: Record<ScreenControlMode, MotorControl> = { remote: 'radio', smart: 'radio', pergola: 'wired', solar: 'solar' };

export interface ControlOptions {
  /** remote index; default: the cheapest handheld remote with enough channels */
  remote?: string;
  /** wind sensor (catalogue: without it the fabric warranty is void). ASSUMPTION: one sensor per project. */
  wind?: boolean;
}

const item = (cat: Catalog, pred: (i: ControlItem) => boolean) => cat.screenControls?.items.find(pred);
const lineOf = (it: ControlItem, qty: number, code: string, params: Record<string, string | number> = {}): Line => ({
  code, params: { index: it.index, name: it.name, qty, unit: it.price, ...params }, amount: round2(it.price * qty), source: it.source,
});

/** Shared control devices for all screens of a project. */
export function screenControlLines(modes: ScreenControlMode[], opts: ControlOptions, cat: Catalog): { lines: Line[]; total: number; issues: Issue[] } {
  const lines: Line[] = [];
  const issues: Issue[] = [];
  const radioRemote = modes.filter((m) => m === 'remote' || m === 'solar').length;
  if (radioRemote) {
    const remotes = (cat.screenControls?.items ?? []).filter((i) => i.kind === 'remote');
    let r = opts.remote ? remotes.find((i) => i.index === opts.remote) : undefined;
    if (!r) r = remotes.filter((i) => i.index.startsWith('RC') && (i.channels ?? 0) >= radioRemote).sort((a, b) => a.price - b.price)[0];
    if (r) {
      lines.push(lineOf(r, 1, 'CONTROL_REMOTE', { screens: radioRemote }));
      if ((r.channels ?? 0) < radioRemote) issues.push({ severity: 'warn', code: 'REMOTE_TOO_FEW_CHANNELS', params: { channels: r.channels ?? 0, screens: radioRemote } });
    }
  }
  if (modes.includes('smart')) {
    const s = item(cat, (i) => i.kind === 'smart');
    if (s) lines.push(lineOf(s, 1, 'CONTROL_SMART'));
  }
  const wired = modes.filter((m) => m === 'pergola').length;
  if (wired) {
    const u1 = item(cat, (i) => i.kind === 'pergolaUnit1')!, u4 = item(cat, (i) => i.kind === 'pergolaUnit4')!;
    let n4 = Math.floor(wired / 4), n1 = wired % 4;
    if (n1 * u1.price > u4.price) { n4 += 1; n1 = 0; } // two or more single units cost more than one 4-motor unit
    if (n4) lines.push(lineOf(u4, n4, 'CONTROL_PERGOLA_UNIT', { motors: wired }));
    if (n1) lines.push(lineOf(u1, n1, 'CONTROL_PERGOLA_UNIT', { motors: wired }));
  }
  if (opts.wind && modes.length) {
    const w = item(cat, (i) => i.kind === 'wind');
    if (w) lines.push(lineOf(w, 1, 'CONTROL_WIND_SENSOR'));
  }
  return { lines, total: round2(lines.reduce((s, l) => s + l.amount, 0)), issues };
}
