import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { coatingSurcharges, lookupGrid, pricePanels, priceVerto } from '../src';
import { loadCatalog } from '../src/node';

const cat = loadCatalog(join(__dirname, '../../../data/catalog/2026-07'), 'catalog-2026-07');

describe('Win Verto (catalogue p.6)', () => {
  it('grid values from the page: 5 profiles × 1950 = 317 €, 40 × 3950 = 4 965 €, 21 × 2950 = 1 792 €', () => {
    const t = cat.tables['verto.profiles']!;
    expect(lookupGrid(t, 5, 1950).price).toBe(317);
    expect(lookupGrid(t, 40, 3950).price).toBe(4965);
    expect(lookupGrid(t, 21, 2950).price).toBe(1792);
    expect((t.meta as { packageWidth: number[] }).packageWidth[0]).toBe(395);
  });
  it('1870 × 2590 opening: 21 profiles (package 1835 mm), spacing 55, billed at 2950 -> 1 792 €', () => {
    const r = priceVerto(1870, 2590, cat);
    expect(r.profiles).toBe(21);
    expect(r.spacing).toBe(57);
    expect(r.billedHeight).toBe(2950);
    expect(r.total).toBe(1792);
  });
  it('wider than 40 profiles: 40-profile price + additional profiles (4500 × 2590: 51 profiles = 3 315 + 11 × 80)', () => {
    const r = priceVerto(4500, 2590, cat);
    expect(r.profiles).toBe(51);
    expect(r.total).toBe(3315 + 880);
  });
  it('Verto coating: 14 % (fine) of the catalogue price', () => {
    expect(coatingSurcharges([{ system: 'VERTO', base: 1792, color: '07' }], cat).total).toBe(250.88);
  });
});

describe('Win Panels (catalogue p.6 / p.7)', () => {
  it('grid values from the pages', () => {
    expect(lookupGrid(cat.tables['panels.fixed.std']!, 700, 1400).price).toBe(574);
    expect(lookupGrid(cat.tables['panels.rotating.std']!, 1800, 3000).price).toBe(2900);
    expect(lookupGrid(cat.tables['panels.fixed.wood']!, 700, 1400).price).toBe(655);
    expect(lookupGrid(cat.tables['panels.rotating.wood']!, 1800, 3000).price).toBe(3356);
    expect(lookupGrid(cat.tables['panels.rail.std']!, 1000, 1).price).toBe(90);
    expect(lookupGrid(cat.tables['panels.rail.std']!, 7000, 6).price).toBe(1246);
    expect(lookupGrid(cat.tables['panels.rail.wood']!, 1000, 1).price).toBe(116);
  });
  it('sliding 3870 × 2590, fixed slats: 3 panels 1330 wide on 3 tracks -> 3 × 1 803 (1500 × 2600) + rail 3 tracks 4000 = 752', () => {
    const r = pricePanels({ width: 3870, height: 2590 }, cat);
    expect(r.panels).toBe(3);
    expect(r.panelWidth).toBe(1330);
    expect(r.tracks).toBe(3);
    expect(r.billed).toEqual({ width: 1500, height: 2600 });
    expect(r.total).toBe(3 * 1803 + 752);
  });
  it('fixed mount 3870: 3 panels 1290 -> billed 1500, connectors 2 joints × 3 × 26 €', () => {
    const r = pricePanels({ width: 3870, height: 2590, mount: 'fixed' }, cat);
    expect(r.total).toBe(3 * 1803 + 156);
  });
  it('rotating slats in a wood-like colour use price list 4: 1870 opening -> 2 panels 965 -> 1000 × 2600 = 1 932 €', () => {
    const r = pricePanels({ width: 1870, height: 2590, slats: 'rotating', wood: true }, cat);
    expect(r.panels).toBe(2);
    expect(r.lines[0]!.amount).toBe(2 * 1932);
    expect(r.lines[1]!.amount).toBe(347); // wood rail, 2 tracks standard, 2000 (p.7)
  });
  it('6370 opening: 4 panels part to both sides on 2 tracks', () => {
    const r = pricePanels({ width: 6370, height: 2560 }, cat);
    expect(r.panels).toBe(4);
    expect(r.tracks).toBe(2);
  });
  it('higher than 3000 is not produced', () => {
    expect(pricePanels({ width: 1500, height: 3100 }, cat).issues[0]!.code).toBe('PANELS_SIZE_OUT_OF_RANGE');
  });
});
