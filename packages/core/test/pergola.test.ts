import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { loadCatalog, pricePergola, coatingPercent } from '../src';

const cat = loadCatalog(join(__dirname, '../../../data/sunwinner/2026-07'), 'sunwinner-2026-07');

// Golden values read directly from the Sun Winner 07.2026 catalogue pages.
describe('golden prices from the catalogue', () => {
  const cases: [string, Parameters<typeof pricePergola>[0], number][] = [
    ['S400 wall 3000×4000 (p.13)', { model: 'S400', mount: 'wall', width: 3000, projection: 4000 }, 8625],
    ['S400 free 4500×7000 (p.14)', { model: 'S400', mount: 'free', width: 4500, projection: 7000 }, 17977],
    ['S400 wall 2000×2000 (p.13)', { model: 'S400', mount: 'wall', width: 2000, projection: 2000 }, 4729],
    ['S500 wall base 3000×4000 (p.14)', { model: 'S500', mount: 'wall', width: 3000, projection: 4000 }, 9706],
    ['S500 wall base 2000×2000 (p.14)', { model: 'S500', mount: 'wall', width: 2000, projection: 2000 }, 5564],
    ['S500 wall base 5000×8000 (p.14)', { model: 'S500', mount: 'wall', width: 5000, projection: 8000 }, 24311],
    ['S500 roof add 2000×2000 (p.24, manual row)', { model: 'S500', mount: 'roof', module: 'add', width: 2000, projection: 2000 }, 4343],
    ['S500 double wall base 5500×2000 (p.29)', { model: 'S500', mount: 'wall', layout: 'double', width: 5500, projection: 2000 }, 13052],
    ['S500 double roof base 6950×4000 (p.36)', { model: 'S500', mount: 'roof', layout: 'double', width: 6950, projection: 4000 }, 20222],
    ['S500 no-roof module 3000×4000 (p.28, merged row)', { model: 'S500', mount: 'wall', module: 'addNoRoof', width: 3000, projection: 4000 }, 3861],
  ];
  for (const [name, cfg, expected] of cases) {
    it(name, () => {
      const r = pricePergola(cfg, cat);
      expect(r.issues.filter((i) => i.severity === 'block')).toEqual([]);
      expect(r.total).toBe(expected);
    });
  }
});

describe('catalogue rules', () => {
  it('bills sizes between steps at the next step (note 6)', () => {
    const r = pricePergola({ model: 'S400', mount: 'wall', width: 3900, projection: 4200 }, cat);
    expect(r.lines[0]!.params).toMatchObject({ width: 4000, projection: 4200 });
    expect(r.total).toBe(10477);
    expect(r.issues.map((i) => i.code)).toContain('BILLED_AT_NEXT_WIDTH');
  });

  it('S400 has no individual projection: blocks and suggests the next louvre step', () => {
    const r = pricePergola({ model: 'S400', mount: 'wall', width: 3000, projection: 4100 }, cat);
    expect(r.issues).toContainEqual({ severity: 'block', code: 'S400_PROJECTION_GRID', params: { requested: 4100, suggested: 4200 } });
  });

  it('S500 individual projection adds 975 € on top of the next grid step', () => {
    const r = pricePergola({ model: 'S500', mount: 'wall', width: 3000, projection: 4100 }, cat);
    expect(r.lines.map((l) => l.code)).toEqual(['PERGOLA_BASE', 'S500_INDIVIDUAL_PROJECTION']);
    expect(r.lines[0]!.params).toMatchObject({ projection: 4250 });
    expect(r.lines[1]!.amount).toBe(975);
  });

  it('blocks sizes outside the catalogue', () => {
    const r = pricePergola({ model: 'S400', mount: 'free', width: 4600, projection: 3000 }, cat);
    expect(r.issues[0]).toMatchObject({ severity: 'block', code: 'SIZE_OUT_OF_RANGE', params: { axis: 'width', max: 4500 } });
    expect(r.total).toBe(0);
  });

  it('S400 cannot be a double pergola', () => {
    const r = pricePergola({ model: 'S400', mount: 'wall', layout: 'double', width: 6000, projection: 3000 }, cat);
    expect(r.issues[0]!.code).toBe('S400_NO_DOUBLE');
  });
});

describe('coating surcharge', () => {
  it('same group on construction and roof uses the whole-pergola rate (8%, not 5%+7%)', () => {
    expect(coatingPercent('S400', { construction: 'fine', roof: 'fine' }, cat)).toBe(8);
    expect(coatingPercent('S400', { construction: 'fine', roof: 'standard' }, cat)).toBe(5);
    expect(coatingPercent('S400', { construction: 'standard', roof: 'wood' }, cat)).toBe(25);
    expect(coatingPercent('S500', { construction: 'wood', roof: 'wood' }, cat)).toBe(34);
  });

  it('adds the surcharge as its own line', () => {
    const r = pricePergola({ model: 'S400', mount: 'wall', width: 3000, projection: 4000, color: { construction: 'fine', roof: 'fine' } }, cat);
    expect(r.lines.at(-1)).toMatchObject({ code: 'COATING_SURCHARGE', amount: 690 });
    expect(r.total).toBe(8625 + 690);
  });

  it('standard colours add nothing', () => {
    const r = pricePergola({ model: 'S400', mount: 'wall', width: 3000, projection: 4000, color: { construction: 'standard', roof: 'standard' } }, cat);
    expect(r.lines).toHaveLength(1);
  });
});
