import { coatingPercent, type PergolaModel } from './pergola';
import { round2 } from './money';
import type { Catalog, ColorEntry, ColorGroup, Line } from './types';

/**
 * Colours and coating surcharges.
 * A colour is referenced by its palette id ('04', '12D', ...) or by a custom group id
 * ('ralAny', 'ralMetallic', 'structural', 'structuralRal') for colours outside the palette,
 * optionally with the customer's code after a colon: 'ralAny:RAL 3004'.
 */
export type CoatingSystem = PergolaModel | 'GLASS' | 'SCREEN_ZIP' | 'SCREEN_CABLE' | 'VERTO';

export const CUSTOM_COLOR_GROUPS: ColorGroup[] = ['ralAny', 'ralMetallic', 'structural', 'structuralRal'];

export function findColor(id: string, cat: Catalog): ColorEntry | undefined {
  return cat.colors?.colors.find((c) => c.id === id);
}

export function colorGroup(id: string, cat: Catalog): ColorGroup {
  const custom = id.split(':')[0]!;
  if ((CUSTOM_COLOR_GROUPS as string[]).includes(custom)) return custom as ColorGroup;
  const c = findColor(id, cat);
  if (!c) throw new Error(`unknown colour ${id} in ${cat.version}`);
  return c.group;
}

/** Coating surcharge in % of the catalogue price of one product. Pergolas: construction + roof (louvres). */
export function coatingPercentFor(system: CoatingSystem, color: string, roofColor: string | undefined, cat: Catalog): number {
  if (system === 'S400' || system === 'S500') {
    const roof = roofColor ?? color;
    return coatingPercent(system, { construction: colorGroup(color, cat), roof: colorGroup(roof, cat), same: roof === color }, cat);
  }
  const v = cat.coating.rates[system]?.[colorGroup(color, cat)];
  if (typeof v !== 'number') throw new Error(`no coating rate ${system}.${colorGroup(color, cat)}`);
  return v;
}

export interface CoatingItem {
  system: CoatingSystem;
  /** catalogue price the percentage applies to */
  base: number;
  color: string;
  /** pergolas only: louvre colour when it differs from the construction */
  roofColor?: string;
  label?: string;
}

/**
 * Coating surcharges for a whole project.
 * ASSUMPTION (open question to Sun Winner): the percentage applies to the catalogue price of each item;
 * the logistics minimum (70 €, wood-like 140 €, catalogue notes on every price list) is checked per colour,
 * i.e. per powder-coating batch over the whole project, and topped up when the batch is below it.
 */
export function coatingSurcharges(items: CoatingItem[], cat: Catalog): { lines: Line[]; total: number } {
  const lines: Line[] = [];
  const batch = new Map<string, number>();
  for (const it of items) {
    const pct = coatingPercentFor(it.system, it.color, it.roofColor, cat);
    if (pct <= 0) continue;
    const amount = round2((it.base * pct) / 100);
    lines.push({ code: 'COATING_SURCHARGE', params: { system: it.system, color: it.color, roof: it.roofColor ?? it.color, percent: pct, base: it.base, label: it.label ?? '' }, amount, source: { url: 'sunwinner coating calculator 07.2026' } });
    // a pergola with two colours is two batches; book the amount to the construction colour (roof share unknown)
    batch.set(it.color, (batch.get(it.color) ?? 0) + amount);
  }
  for (const [color, sum] of batch) {
    const min = colorGroup(color, cat) === 'wood' ? cat.coating.minimumCharge.wood : cat.coating.minimumCharge.default;
    if (sum < min) lines.push({ code: 'COATING_MINIMUM', params: { color, minimum: min, coated: round2(sum) }, amount: round2(min - sum), source: { url: 'sunwinner price lists 07.2026, powder coating logistics minimum' } });
  }
  return { lines, total: round2(lines.reduce((s, l) => s + l.amount, 0)) };
}

/** Win Screen fabric surcharge: width × height × €/m² of the collection (catalogue "SURCHARGES FOR FABRICS"). */
export function fabricSurcharge(width: number, height: number, collection: string, cat: Catalog): Line {
  const c = cat.fabrics?.collections.find((f) => f.id === collection);
  if (!c) throw new Error(`unknown fabric collection ${collection}`);
  const m2 = (width / 1000) * (height / 1000);
  return {
    code: 'FABRIC_SURCHARGE',
    params: { collection: c.name, m2: round2(m2), eurPerM2: c.eurPerM2 },
    amount: round2(m2 * c.eurPerM2),
    source: { file: cat.fabrics!.source.file, page: cat.fabrics!.source.pages[0] },
  };
}
