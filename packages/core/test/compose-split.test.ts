import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { compose, splitLimits } from '../src';
import { loadCatalog } from '../src/node';

const cat = loadCatalog(join(__dirname, '../../../data/catalog/2026-07'), 'catalog-2026-07');

describe('manual division into modules', () => {
  // terrace 5300 × 5500 freestanding, louvres perpendicular: louvre length = 5500 (u), projection = 5300 → 5400 (v)
  const req = { mount: 'free' as const, width: 5300, depth: 5500, louvres: 'perpendicular' as const, families: ['S400' as const] };

  it('halves 2750 + 2750: two S400 free-standing pergolas priced at width 3000 × 5400 = 2 × 11 301 € (p.14)', () => {
    const { options } = compose({ ...req, split: { family: 'S400', u: [2750, 2750] } }, cat);
    const m = options.find((o) => o.tags.includes('manual'))!;
    expect(m.modules.map((x) => x.louvreLength)).toEqual([2750, 2750]);
    expect(m.modules.map((x) => x.projection)).toEqual([5400, 5400]);
    expect(m.modules.map((x) => x.price)).toEqual([11301, 11301]);
    expect(m.total).toBe(22602);
  });

  it('parts that do not add up or leave the range are ignored with SPLIT_INVALID', () => {
    const sum = compose({ ...req, split: { family: 'S400', u: [2750, 2700] } }, cat);
    expect(sum.options.some((o) => o.tags.includes('manual'))).toBe(false);
    expect(sum.options[0]!.issues.some((i) => i.code === 'SPLIT_INVALID')).toBe(true);
    const range = compose({ ...req, split: { family: 'S400', u: [1500, 4000] } }, cat);
    expect(range.options.some((o) => o.tags.includes('manual'))).toBe(false);
  });

  it('limits come from the price grids: S400 louvre 2000–4500, projection step 200', () => {
    expect(splitLimits('S400')).toMatchObject({ uMin: 2000, uMax: 4500, vMin: 2000, vMax: 7000, vStep: 200 });
  });
});
