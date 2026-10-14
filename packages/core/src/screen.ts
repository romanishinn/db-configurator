import { fabricSurcharge } from './colors';
import { lookupGrid, NotProducedError, OutOfRangeError } from './grid';
import { round2 } from './money';
import type { Catalog, ControlItem, GridTable, Issue, Line, MotorBrand, ScreenMotor } from './types';

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
  /** motor brand, default WIN CONTROL (the manufacturer's own brand); 'custom' = own motor at an own price */
  brand?: MotorBrand;
  customMotor?: { name?: string; price?: number };
  /** omit to take the cheapest system that builds this size with this fabric */
  system?: ScreenSystem;
  /**
   * 'sameOpenness': if the fabric is not made this wide / high (collection limits drawn in the price table,
   * e.g. Soltis 7635 at most 6000 on ZIP 130), take the cheapest screen with another collection of the same
   * openness factor that is (e.g. Serge 600, also OF 5 %). The result then carries a FABRIC_SUBSTITUTED issue.
   */
  fabricFallback?: 'sameOpenness';
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

/** Cheapest motor of the brand and control type with enough torque for the size and fitting the roller width. */
export function pickMotor(cat: Catalog, brand: MotorBrand, control: MotorControl, nm: number, width: number): ScreenMotor | undefined {
  return (cat.screenMotors?.motors ?? [])
    .filter((m) => m.brand === brand && m.control === control && m.nm >= nm && m.minWidth.adaptive <= width)
    .sort((a, b) => a.price - b.price || a.nm - b.nm)[0];
}

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
  const brand = req.brand ?? 'wincontrol';
  const motor = brand === 'custom'
    ? { brand, index: req.customMotor?.name || 'own motor', control, nm, price: req.customMotor?.price ?? 0, minWidth: { adaptive: 0, flush: 0 } } as ScreenMotor
    : pickMotor(cat, brand, control, nm, req.width);
  if (!motor) {
    issues.push({ severity: 'block', code: 'SCREEN_NO_MOTOR', params: { system, torque: nm, control, brand } });
    return { option: null, issues };
  }
  const lines: Line[] = [
    { code: 'SCREEN_BASE', params: { system, width: g.x, height: g.y }, amount: g.price, source: g.source },
    { code: 'SCREEN_MOTOR', params: { brand: motor.brand, index: motor.index, model: motor.model ?? '', nm: motor.nm, required: nm, control }, amount: motor.price, source: (motor as { source?: { file: string; page: number } }).source },
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
  const res = selectScreenExact(req, cat);
  if (res.best || req.fabricFallback !== 'sameOpenness') return res;
  if (!res.issues.some((i) => i.code === 'FABRIC_MAX_WIDTH' || i.code === 'FABRIC_MAX_HEIGHT')) return res;
  const from = req.fabric ?? DEFAULT_FABRIC;
  const f0 = cat.fabrics?.collections.find((c) => c.id === from);
  if (!f0) return res;
  let alt: { id: string; r: ScreenResult } | null = null;
  for (const c of cat.fabrics!.collections) {
    if (c.id === from || c.openness !== f0.openness) continue;
    const r = selectScreenExact({ ...req, fabric: c.id }, cat);
    if (r.best && (!alt || r.best.total < alt.r.best!.total)) alt = { id: c.id, r };
  }
  if (!alt) return res;
  return { ...alt.r, issues: [{ severity: 'info', code: 'FABRIC_SUBSTITUTED', params: { from, to: alt.id } }] };
}

function selectScreenExact(req: ScreenRequest, cat: Catalog): ScreenResult {
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
 * How a screen is operated. Each mode fixes the motor type and the shared control devices of the chosen brand:
 * - remote:  radio motor + one remote for the project
 * - smart:   radio motor + one smart unit (WIN CONTROL Smart / YOODA Smart Home 3.0 / Somfy TaHoma Switch Pro)
 * - pergola: wired motor + TELECO central unit -> the pergola's 63-channel remote (S400 p.20 / S500 p.45);
 *            works with YOODA and Somfy wired motors too (confirmed by D&B Solutions, 12.10.2026)
 * - switch:  wired motor + a wall switch per motor (YOODA, Somfy; WIN CONTROL lists no wired switch)
 * - solar:   solar radio motor (WIN CONTROL kit 20 Nm, Somfy RS100 Solar io 6–20 Nm) + remote
 */
export type ScreenControlMode = 'remote' | 'smart' | 'pergola' | 'switch' | 'solar';
export const MOTOR_FOR_MODE: Record<ScreenControlMode, MotorControl> = { remote: 'radio', smart: 'radio', pergola: 'wired', switch: 'wired', solar: 'solar' };
export const MOTOR_BRANDS: MotorBrand[] = ['yooda', 'wincontrol', 'somfy', 'custom'];

const items = (cat: Catalog, brand: MotorBrand | 'any', kind: ControlItem['kind']) =>
  (cat.screenControls?.items ?? []).filter((i) => i.brand === brand && i.kind === kind).sort((a, b) => a.price - b.price);

/** Control modes the brand's catalogue supports. */
export function brandModes(brand: MotorBrand, cat: Catalog): ScreenControlMode[] {
  if (brand === 'custom') return ['remote', 'smart', 'pergola', 'switch', 'solar'];
  const has = (c: MotorControl) => (cat.screenMotors?.motors ?? []).some((m) => m.brand === brand && m.control === c);
  const out: ScreenControlMode[] = [];
  if (has('radio') && items(cat, brand, 'remote').length) out.push('remote');
  if (has('radio') && items(cat, brand, 'smart').length) out.push('smart');
  if (has('wired') && items(cat, 'any', 'pergolaUnit4').length) out.push('pergola');
  if (has('wired') && items(cat, brand, 'switch').length) out.push('switch');
  if (has('solar') && items(cat, brand, 'remote').length) out.push('solar');
  return out;
}

export interface ControlOptions {
  brand?: MotorBrand;
  /** remote index; default: the cheapest handheld remote of the brand with enough channels */
  remote?: string;
  /** wind sensors (catalogue: without one the fabric warranty is void) */
  wind?: boolean;
  /** number of wind sensors: one per pergola system that has screens */
  windSensors?: number;
  /** own controls for brand 'custom' (remotes, sensors…), EUR per project */
  customControls?: number;
  /**
   * Channels the pergola itself already takes on its included TELECO 63-channel remote (one per roof module —
   * ASSUMPTION; LED, heaters etc. add theirs). When given, the pergola remote is planned: screens operated
   * "from the pergola remote" take one channel each; above 63 channels an additional remote is added.
   */
  pergolaChannels?: number;
}

const lineOf = (it: ControlItem, qty: number, code: string, params: Record<string, string | number> = {}): Line => ({
  code, params: { index: it.index, name: it.name, brand: it.brand, qty, unit: it.price, ...params }, amount: round2(it.price * qty), source: it.source,
});

/** Shared control devices for all screens of a project. */
export function screenControlLines(modes: ScreenControlMode[], opts: ControlOptions, cat: Catalog): { lines: Line[]; total: number; issues: Issue[] } {
  const brand = opts.brand ?? 'wincontrol';
  const lines: Line[] = [];
  const issues: Issue[] = [];
  const count = (m: ScreenControlMode) => modes.filter((x) => x === m).length;
  if (brand === 'custom') {
    if ((opts.customControls ?? 0) > 0) lines.push({ code: 'CONTROL_CUSTOM', params: { screens: modes.length }, amount: round2(opts.customControls!) });
  } else {
    const radioRemote = count('remote') + count('solar');
    if (radioRemote) {
      const all = items(cat, brand, 'remote');
      let r = opts.remote ? all.find((i) => i.index === opts.remote) : undefined;
      if (!r) r = all.filter((i) => !i.wall && (i.channels ?? 0) >= radioRemote)[0] ?? all.filter((i) => (i.channels ?? 0) >= radioRemote)[0];
      if (!r) {
        r = [...all].sort((a, b) => (b.channels ?? 0) - (a.channels ?? 0))[0];
      }
      if (r) {
        lines.push(lineOf(r, 1, 'CONTROL_REMOTE', { screens: radioRemote }));
        if ((r.channels ?? 0) < radioRemote) {
          const fit = all.filter((i) => !i.wall && (i.channels ?? 0) >= radioRemote)[0] ?? all.filter((i) => (i.channels ?? 0) >= radioRemote)[0];
          issues.push({ severity: 'warn', code: 'REMOTE_TOO_FEW_CHANNELS', params: { channels: r.channels ?? 0, screens: radioRemote, suggest: fit?.index ?? '', suggestChannels: fit?.channels ?? 0, suggestPrice: fit?.price ?? 0 } });
        }
      }
    }
    if (count('smart')) {
      const s = items(cat, brand, 'smart')[0];
      if (s) lines.push(lineOf(s, 1, 'CONTROL_SMART'));
    }
    if (count('switch')) {
      const sw = items(cat, brand, 'switch')[0];
      if (sw) lines.push(lineOf(sw, count('switch'), 'CONTROL_SWITCH'));
    }
  }
  const wired = count('pergola');
  if (wired) {
    const u1 = items(cat, 'any', 'pergolaUnit1')[0]!, u4 = items(cat, 'any', 'pergolaUnit4')[0]!;
    let n4 = Math.floor(wired / 4), n1 = wired % 4;
    if (n1 * u1.price > u4.price) { n4 += 1; n1 = 0; } // two or more single units cost more than one 4-motor unit
    if (n4) lines.push(lineOf(u4, n4, 'CONTROL_PERGOLA_UNIT', { motors: wired }));
    if (n1) lines.push(lineOf(u1, n1, 'CONTROL_PERGOLA_UNIT', { motors: wired }));
  }
  if (opts.pergolaChannels !== undefined) {
    const pr = items(cat, 'any', 'pergolaRemote')[0];
    if (pr) {
      const used = opts.pergolaChannels + wired;
      const cap = pr.channels ?? 63;
      lines.push({ code: 'CONTROL_PERGOLA_REMOTE', params: { index: pr.index, name: pr.name, channels: cap, used, roof: opts.pergolaChannels, screens: wired }, amount: 0, source: pr.source });
      const extra = Math.ceil(used / cap) - 1;
      if (extra > 0) {
        lines.push({ code: 'CONTROL_PERGOLA_REMOTE_EXTRA', params: { index: pr.index, name: pr.name, qty: extra, unit: pr.additionalPrice ?? 0 }, amount: round2(extra * (pr.additionalPrice ?? 0)), source: pr.source });
        issues.push({ severity: 'warn', code: 'PERGOLA_REMOTE_FULL', params: { used, channels: cap, extra } });
      }
    }
  }
  if (opts.wind && modes.length && brand !== 'custom') {
    // radio screens need a radio sensor of the brand where the brand has one; wired-only projects take the cheapest
    const anyRadio = modes.some((m) => MOTOR_FOR_MODE[m] !== 'wired');
    const sensors = items(cat, brand, 'wind');
    const w = (anyRadio ? sensors.find((i) => i.radio) : undefined) ?? sensors[0];
    if (w) lines.push(lineOf(w, Math.max(1, opts.windSensors ?? 1), 'CONTROL_WIND_SENSOR'));
  }
  return { lines, total: round2(lines.reduce((s, l) => s + l.amount, 0)), issues };
}
