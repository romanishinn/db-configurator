import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { coatingPercentFor, coatingSurcharges, colorGroup, compose, fabricSurcharge, pricePergola, selectGlass } from '../src';
import { loadCatalog } from '../src/node';

const cat = loadCatalog(join(__dirname, '../../../data/catalog/2026-07'), 'catalog-2026-07');

describe('palette (coating calculator 07.2026)', () => {
  it('37 palette colours + 45 wood-like, groups as in the calculator', () => {
    const c = cat.colors!.colors;
    expect(c).toHaveLength(82);
    expect(c.filter((x) => x.group === 'wood')).toHaveLength(45);
    expect(c.filter((x) => x.group === 'standard').map((x) => x.id)).toEqual(['01', '04']);
    expect(colorGroup('07', cat)).toBe('fine');
    expect(colorGroup('12', cat)).toBe('smooth');
    expect(colorGroup('25', cat)).toBe('exclusive');
    expect(colorGroup('ralAny:RAL 3004', cat)).toBe('ralAny');
  });
});

describe('coating surcharges', () => {
  // S400 wall 3000 × 4000 = 8 625 € (S400 p.13)
  const base = 8625;
  it('S400 one fine colour on the whole pergola: 8 %', () => {
    expect(coatingPercentFor('S400', '07', '07', cat)).toBe(8);
    expect(coatingSurcharges([{ system: 'S400', base, color: '07' }], cat).total).toBe(690);
  });
  it('S400 fine construction, standard louvres: construction rate 5 %', () => {
    expect(coatingPercentFor('S400', '07', '04', cat)).toBe(5);
    expect(coatingSurcharges([{ system: 'S400', base, color: '07', roofColor: '04' }], cat).total).toBe(431.25);
  });
  it('S400 standard construction, fine louvres: roof rate 7 %', () => {
    expect(coatingPercentFor('S400', '04', '07', cat)).toBe(7);
  });
  it('S400 two different fine colours: 5 % + 7 % (ASSUMPTION: two coatings)', () => {
    expect(coatingPercentFor('S400', '07', '32', cat)).toBe(12);
  });
  it('S500 wood-like on the whole pergola: 34 % of 9 706 € (S500 wall base 3000 × 4000)', () => {
    const p = pricePergola({ model: 'S500', mount: 'wall', width: 3000, projection: 4000 }, cat);
    expect(p.total).toBe(9706);
    expect(coatingSurcharges([{ system: 'S500', base: p.total, color: '12D' }], cat).total).toBe(3300.04);
  });
  it('systems: Glass 7/8/19/40 %, ZIP 8/16/40 %, Verto 14/100 %', () => {
    expect(coatingPercentFor('GLASS', '07', undefined, cat)).toBe(7);
    expect(coatingPercentFor('GLASS', '12', undefined, cat)).toBe(8);
    expect(coatingPercentFor('GLASS', '25', undefined, cat)).toBe(19);
    expect(coatingPercentFor('GLASS', '01D', undefined, cat)).toBe(40);
    expect(coatingPercentFor('SCREEN_ZIP', '07', undefined, cat)).toBe(8);
    expect(coatingPercentFor('SCREEN_ZIP', '25', undefined, cat)).toBe(16);
    expect(coatingPercentFor('SCREEN_ZIP', '01D', undefined, cat)).toBe(40);
    expect(coatingPercentFor('VERTO', '07', undefined, cat)).toBe(14);
    expect(coatingPercentFor('VERTO', '01D', undefined, cat)).toBe(100);
    expect(coatingPercentFor('GLASS', '04', undefined, cat)).toBe(0);
  });
  it('Win Glass 8 mm 3 panels 2000 × 1500 = 859 €, fine colour 7 % = 60.13 € -> topped up to the 70 € minimum', () => {
    const g = selectGlass({ width: 2000, height: 1500, thickness: 8 }, cat).best!;
    expect(g.price).toBe(859);
    const r = coatingSurcharges([{ system: 'GLASS', base: g.price, color: '07' }], cat);
    expect(r.lines.map((l) => [l.code, l.amount])).toEqual([['COATING_SURCHARGE', 60.13], ['COATING_MINIMUM', 9.87]]);
    expect(r.total).toBe(70);
  });
  it('wood-like minimum is 140 €; one colour batch over several items reaches it together', () => {
    const one = coatingSurcharges([{ system: 'GLASS', base: 300, color: '01D' }], cat);
    expect(one.total).toBe(140);
    const two = coatingSurcharges([{ system: 'GLASS', base: 200, color: '01D' }, { system: 'GLASS', base: 200, color: '01D' }], cat);
    expect(two.total).toBe(160);
  });
  it('standard colours: no surcharge, no minimum', () => {
    expect(coatingSurcharges([{ system: 'S400', base, color: '04' }, { system: 'GLASS', base: 859, color: '01' }], cat).lines).toEqual([]);
  });
  it('composer exposes the grid price per module (coating base, without the 975 € individual projection)', () => {
    const o = compose({ mount: 'wall', width: 3000, depth: 4100 }, cat).options.find((x) => x.family === 'S500')!;
    expect(o.modules[0]!.price - o.modules[0]!.gridPrice).toBe(975);
  });
});

describe('Win Screen fabric surcharges (Win Screen catalogue, "SURCHARGES FOR FABRICS")', () => {
  it('six collections, Soltis 7635 in price', () => {
    expect(cat.fabrics!.collections.map((c) => [c.name, c.eurPerM2])).toEqual([
      ['Soltis 7635', 0], ['Soltis 86', 10], ['Serge 600', 7], ['Soltis 92', 15], ['Serge 100', 11], ['Serge 600 BO Lunar', 46],
    ]);
  });
  it('Soltis 92, 3000 × 2500 mm = 7.5 m² × 15 € = 112.50 €', () => {
    expect(fabricSurcharge(3000, 2500, 'soltis-92', cat).amount).toBe(112.5);
  });
});
