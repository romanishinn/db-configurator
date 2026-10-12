import type { Composition, PlacedModule } from './compose';
import { lookupGrid, OutOfRangeError } from './grid';
import { round2 } from './money';
import type { Catalog, GridTable, Issue, Line } from './types';

/**
 * Pergola options (Win Climatic S400 / S500 catalogues 07.2026, option pages).
 * Lighting, thermal insert and remote-controlled devices are priced per roof module (the catalogue tables are
 * "price per 1 unit of the pergola"); smart units and heaters per project; sensors per pergola system.
 */
export type LedColour = 'white' | 'rgb' | 'rgbw';
export type GutterLed = 'bwhite' | 'brgb' | 'brgbw' | 'cwhitergb';
export type SensorChoice = 'wind' | 'rain' | 'set' | 'multi';

export interface PergolaOptions {
  /** LED strips in N louvres of every module (S500 double: N per half) */
  ledLouvres?: { colour: LedColour; louvres: number } | null;
  ledGutter?: GutterLed | null;
  thermal?: boolean;
  sensors?: SensorChoice | null;
  smart?: 'bluetooth' | 'wifi' | null;
  heaters?: { set: string; qty: number } | null;
  audio?: number;
  /** total post height, mm: standard up to 2800 */
  postHeight?: number;
  internalBox?: number;
  sockets?: { power: number; usb: number };
}

interface Scalar { values: number[]; source: { file: string; page: number } }
interface HeaterSet { id: string; name: string; heaters: number; watts: number; channels: number; price: number; needsInternalBox: boolean }
export interface OptionScalars {
  [k: string]: Scalar | { [m: string]: { sets: HeaterSet[]; preparation: number; source: { file: string; page: number } } };
}

export interface OptionsResult {
  lines: Line[];
  total: number;
  /** channels the options take on the pergola remote */
  channels: number;
  issues: Issue[];
}

const modelOf = (c: Composition) => (c.family === 'S400' ? 's400' : 's500');
const sc = (cat: Catalog, key: string) => (cat.optionScalars?.[key] as Scalar | undefined);

/** Grid lookup that bills sizes below the first column/row at the first one (ASSUMPTION: table minimum). */
function lookupMin(t: GridTable, x: number, y: number, issues: Issue[]) {
  const cx = Math.max(x, t.x.values[0]!), cy = Math.max(y, t.y.values[0]!);
  if (cx !== x || cy !== y) issues.push({ severity: 'info', code: 'OPT_BILLED_AT_TABLE_MIN', params: { table: t.id, x, y, billedX: cx, billedY: cy } });
  return lookupGrid(t, cx, cy);
}

/** Pergola systems: separate S400 pergolas are separate systems; joined S500 modules form one. */
export function pergolaSystems(c: Composition): PlacedModule[][] {
  return c.family === 'S400' ? c.modules.map((m) => [m]) : [c.modules];
}

export function priceOptions(c: Composition, o: PergolaOptions, cat: Catalog): OptionsResult {
  const lines: Line[] = [];
  const issues: Issue[] = [];
  let channels = 0;
  const model = modelOf(c);
  const dbl = c.family === 'S500_DOUBLE';
  const tbl = (id: string) => {
    const t = cat.tables[id];
    if (!t) throw new Error(`option table ${id} missing`);
    return t;
  };
  const add = (code: string, amount: number, params: Record<string, string | number>, source?: { file?: string; page?: number; table?: string }) =>
    lines.push({ code, params, amount: round2(amount), source });

  for (const m of c.modules) {
    const ref = `${m.louvreLength}×${m.projection}`;
    if (o.ledLouvres) {
      const t = tbl(`opt.${dbl ? 's500d' : model}.ledlouvre.${o.ledLouvres.colour}`);
      const n = dbl ? o.ledLouvres.louvres * 2 : o.ledLouvres.louvres;
      try {
        const g = lookupMin(t, m.louvreLength, n, issues);
        add('OPT_LED_LOUVRES', g.price, { module: ref, colour: o.ledLouvres.colour, louvres: n }, g.source);
        channels += 1;
      } catch (e) {
        if (!(e instanceof OutOfRangeError)) throw e;
        issues.push({ severity: 'block', code: 'OPT_LED_LOUVRES_RANGE', params: { module: ref } });
      }
    }
    if (o.ledGutter) {
      const t = tbl(`opt.${dbl ? 's500d' : model}.gutter.${o.ledGutter}`);
      try {
        const g = lookupMin(t, m.louvreLength, m.projection, issues);
        add('OPT_LED_GUTTER', g.price, { module: ref, type: o.ledGutter }, g.source);
        channels += 1;
      } catch (e) {
        if (!(e instanceof OutOfRangeError)) throw e;
        issues.push({ severity: 'block', code: 'OPT_LED_GUTTER_RANGE', params: { module: ref } });
      }
    }
    if (o.thermal) {
      const t = tbl(`opt.${model}.thermal`);
      try {
        const g = lookupMin(t, m.louvreLength, m.projection, issues);
        add('OPT_THERMAL', g.price, { module: ref }, g.source);
      } catch (e) {
        if (!(e instanceof OutOfRangeError)) throw e;
        issues.push({ severity: 'block', code: 'OPT_THERMAL_RANGE', params: { module: ref } });
      }
    }
  }

  // weather sensors (S400 p.19 / S500 p.44): wind, rain, wind+rain+temperature set, multisensor.
  // Wind and rain sensors serve a single- or multi-module pergola; the temperature sensor is needed in each
  // module, so the set adds a temperature sensor (60 €) for every further module of a system.
  if (o.sensors) {
    const s = sc(cat, `${model}.sensors`)!;
    const [wind, rain, temp, , set, multi] = s.values as [number, number, number, number, number, number];
    for (const sys of pergolaSystems(c)) {
      const extra = sys.length - 1;
      if (o.sensors === 'wind') add('OPT_SENSOR', wind, { sensor: 'wind', modules: sys.length }, s.source);
      if (o.sensors === 'rain') add('OPT_SENSOR', rain, { sensor: 'rain', modules: sys.length }, s.source);
      if (o.sensors === 'set') add('OPT_SENSOR', set + extra * temp, { sensor: 'set', modules: sys.length, extraTemp: extra }, s.source);
      if (o.sensors === 'multi') add('OPT_SENSOR', multi + extra * temp, { sensor: 'multi', modules: sys.length, extraTemp: extra }, s.source);
    }
    if (o.sensors === 'multi') issues.push({ severity: 'info', code: 'OPT_MULTISENSOR_UNIT', params: { change: 229 } });
  }
  if (o.smart) {
    const s = sc(cat, `${model}.smart`)!;
    add('OPT_SMART', o.smart === 'bluetooth' ? s.values[0]! : s.values[1]!, { unit: o.smart }, s.source);
  }
  let boxes = o.internalBox ?? 0;
  if (o.heaters && o.heaters.qty > 0) {
    const h = (cat.optionScalars?.heaters as { [m: string]: { sets: HeaterSet[]; preparation: number; source: { file: string; page: number } } })[model]!;
    const set = h.sets.find((x) => x.id === o.heaters!.set);
    if (set) {
      add('OPT_HEATERS', set.price * o.heaters.qty, { set: set.id, name: set.name, qty: o.heaters.qty, unit: set.price }, h.source);
      // ASSUMPTION: the structure preparation (90 €) is charged per heater
      const heaters = set.heaters * o.heaters.qty;
      add('OPT_HEATER_PREP', h.preparation * heaters, { heaters, unit: h.preparation }, h.source);
      channels += set.channels * o.heaters.qty;
      if (set.needsInternalBox && boxes === 0) {
        boxes = 1; // models 2 and 3: control units cannot sit inside the frame -> internal box required
        issues.push({ severity: 'info', code: 'OPT_INTERNAL_BOX_FOR_HEATERS' });
      }
    }
  }
  if (boxes > 0) {
    const s = sc(cat, `${model}.internalBox`)!;
    add('OPT_INTERNAL_BOX', s.values[0]! * boxes, { qty: boxes, unit: s.values[0]! }, s.source);
  }
  if (o.audio && o.audio > 0) {
    const s = sc(cat, `${model}.audio`)!;
    add('OPT_AUDIO', s.values[0]! * o.audio, { qty: o.audio, unit: s.values[0]! }, s.source);
    channels += o.audio; // ASSUMPTION: the remote's audio key takes one channel per set
  }
  if (o.postHeight && o.postHeight > 2800) {
    const s = sc(cat, `${model}.postHeight`)!;
    // S400: 2801–3000 / 3001–3200; S500: 2801–3200
    const unit = model === 's400' ? (o.postHeight <= 3000 ? s.values[0]! : s.values[1]!) : s.values[0]!;
    if (o.postHeight > 3200) issues.push({ severity: 'block', code: 'OPT_POST_TOO_HIGH', params: { max: 3200 } });
    else if (c.posts > 0) add('OPT_POST_HEIGHT', unit * c.posts, { posts: c.posts, height: o.postHeight, unit }, s.source);
  }
  if (o.sockets && model === 's500' && (o.sockets.power || o.sockets.usb)) {
    const s = sc(cat, 's500.sockets')!;
    if (o.sockets.power) add('OPT_SOCKET', s.values[0]! * o.sockets.power, { kind: 'power', qty: o.sockets.power, unit: s.values[0]! }, s.source);
    if (o.sockets.usb) add('OPT_SOCKET', s.values[1]! * o.sockets.usb, { kind: 'usb', qty: o.sockets.usb, unit: s.values[1]! }, s.source);
  }
  return { lines, total: round2(lines.reduce((a, l) => a + l.amount, 0)), channels, issues };
}
