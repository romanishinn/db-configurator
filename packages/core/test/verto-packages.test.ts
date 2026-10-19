import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { priceVertoPackage, vertoCornerPrice, vertoMaxProfiles, vertoPackageWidth, vertoProfileLength } from '../src';
import { loadCatalog } from '../src/node';

const cat = loadCatalog(join(__dirname, '../../../data/catalog/2026-07'), 'catalog-2026-07');

// Golden values read from the Win Verto price list 07.2026, p.5 (profile lengths) and p.6 (package table).
describe('Win Verto packages (p.6)', () => {
  it('7 profiles, length 2800 → row 2950, column 7 = 626 €', () => {
    const r = priceVertoPackage(7, 2800, cat);
    expect(r.billedHeight).toBe(2950);
    expect(r.total).toBe(626);
  });
  it('5 profiles, length 1950 → 317 €; 40 profiles, 3950 → 4 965 €', () => {
    expect(priceVertoPackage(5, 1950, cat).total).toBe(317);
    expect(priceVertoPackage(40, 3950, cat).total).toBe(4965);
  });
  it('45 profiles, length 2590 → 40-profile price 3 315 € + 5 × 80 € additional', () => {
    const r = priceVertoPackage(45, 2590, cat);
    expect(r.total).toBe(3315 + 5 * 80);
  });
  it('3 profiles are billed as 5 (first column), 3 150 row: 557 €', () => {
    const r = priceVertoPackage(3, 3100, cat);
    expect(r.total).toBe(557);
    expect(r.issues.map((i) => i.code)).toContain('OPT_BILLED_AT_TABLE_MIN');
  });
  it('longer than 3950 mm is not in the list', () => {
    expect(priceVertoPackage(7, 4000, cat).issues.map((i) => i.code)).toEqual(['VERTO_HEIGHT_OUT_OF_RANGE']);
  });
  it('package width 90·N − 55 (5 → 395 mm, 7 → 575 mm); profiles that fit in 1 m: 11', () => {
    expect(vertoPackageWidth(5)).toBe(395);
    expect(vertoPackageWidth(7)).toBe(575);
    expect(vertoMaxProfiles(1000)).toBe(11);
  });
  it('corner connection 53 € per corner (p.6)', () => {
    expect(vertoCornerPrice(cat)).toBe(53);
  });
});

describe('Win Verto profile length by mounting (p.5)', () => {
  it('recess: S400 H − 210, S500 H − 240', () => {
    expect(vertoProfileLength('C', 'S400', 2800)).toBe(2590);
    expect(vertoProfileLength('C', 'S500', 2800)).toBe(2560);
  });
  it('surface up to the louvres: S400 H + 110, S500 H + 150', () => {
    expect(vertoProfileLength('A', 'S400', 2800)).toBe(2910);
    expect(vertoProfileLength('A', 'S500_DOUBLE', 3200)).toBe(3350);
  });
  it('surface to the crown and corner connection: H', () => {
    expect(vertoProfileLength('B', 'S400', 3000)).toBe(3000);
    expect(vertoProfileLength('D', 'S500', 2800)).toBe(2800);
  });
});
