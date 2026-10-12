import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { glazingSurcharge, selectGlass, lookupGrid, thicknessFor } from '../src';
import { loadCatalog } from '../src/node';

const cat = loadCatalog(join(__dirname, '../../../data/catalog/2026-07'), 'catalog-2026-07');
const cell = (id: string, w: number, h: number) => lookupGrid(cat.tables[id]!, w, h).price;

describe('Win Glass golden cells (read from the catalogue pages)', () => {
  it('8 mm, 4 tracks, single-side, 3 panels: 2000 × 1500 = 859 € (p.15)', () => expect(cell('glass.8mm.4t.single.3p', 2000, 1500)).toBe(859));
  it('8 mm, 6 tracks, single-side, 6 panels: 7750 × 2400 = 3 477 € (p.18)', () => expect(cell('glass.8mm.6t.single.6p', 7750, 2400)).toBe(3477));
  it('10 mm, 3 panels: 3250 × 3100 = 2 075 € — top of the staircase (p.25)', () => expect(cell('glass.10mm.4t.single.3p', 3250, 3100)).toBe(2075));
  it('8 mm, 12 panels: 17750 × 1500 = 5 820 € — continuation page (p.24)', () => expect(cell('glass.8mm.6t.double.12p', 17750, 1500)).toBe(5820));
  it('10 mm, 3 panels: 3500 × 3100 is not produced (empty cell)', () => expect(() => cell('glass.10mm.4t.single.3p', 3500, 3100)).toThrow(/not produced/));
});

describe('glass selector', () => {
  it('picks the cheapest variant that produces the opening and reports the page', () => {
    const r = selectGlass({ width: 3870, height: 2590, thickness: 8 }, cat);
    expect(r.best).not.toBeNull();
    expect(r.options.every((o, i, a) => i === 0 || a[i - 1]!.price <= o.price)).toBe(true);
    expect(r.best!.source.page).toBeGreaterThanOrEqual(15);
    expect(r.best!.panelWidth).toBeLessThanOrEqual(1493);
  });

  it('10 mm tall glass: falls back to a variant that still produces 3500 × 3100', () => {
    const r = selectGlass({ width: 3500, height: 3100, thickness: 10 }, cat);
    expect(r.best).not.toBeNull();
    expect(r.options.find((o) => o.table === 'glass.10mm.4t.single.3p')).toBeUndefined();
  });

  it('8 mm above 2600 mm: blocked, says how high 8 mm can go', () => {
    const r = selectGlass({ width: 4000, height: 2800, thickness: 8 }, cat);
    expect(r.best).toBeNull();
    expect(r.issues[0]).toMatchObject({ code: 'GLASS_TOO_HIGH', params: { maxHeight: 2600 } });
  });

  it('wider than any system: blocked with the catalogue range', () => {
    const r = selectGlass({ width: 18000, height: 2000 }, cat);
    expect(r.issues[0]!.code).toBe('GLASS_WIDTH_OUT_OF_RANGE');
  });
});

describe('Win Glass glazing surcharges (p.9, €/m² of the opening)', () => {
  it('8 mm milk: 57 €/m², 3 × 2 m = 342 €; float is included in the price', () => {
    expect(glazingSurcharge('milk', 8, 3000, 2000, cat).amount).toBe(342);
    expect(glazingSurcharge('float', 8, 3000, 2000, cat).amount).toBe(0);
  });
  it('10 mm black: 125 €/m², 4 × 2.5 m = 1 250 €; 10 mm mirror 285 €/m²', () => {
    expect(glazingSurcharge('black', 10, 4000, 2500, cat).amount).toBe(1250);
    expect(glazingSurcharge('mirror', 10, 1000, 1000, cat).rate).toBe(285);
  });
  it('mirror exists only in 10 mm: 8 mm is blocked, the thickness is picked automatically', () => {
    expect(glazingSurcharge('mirror', 8, 1000, 1000, cat).issues[0]!.code).toBe('GLAZING_NOT_IN_THICKNESS');
    expect(thicknessFor('mirror', cat)).toBe(10);
    expect(thicknessFor('brown', cat)).toBe(8);
  });
});

