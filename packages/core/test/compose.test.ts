import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { compose } from '../src';
import { loadCatalog } from '../src/node';

const cat = loadCatalog(join(__dirname, '../../../data/sunwinner/2026-07'), 'sunwinner-2026-07');

describe('composer: terrace 12000 × 2000, wall-mounted', () => {
  const { options } = compose({ mount: 'wall', width: 12000, depth: 2000 }, cat);
  const byFamily = (f: string) => options.find((o) => o.family === f)!;

  it('cheapest: three separate S400 pergolas 4000 × 2000 = 3 × 6 476 €', () => {
    expect(options[0]!.family).toBe('S400');
    expect(options[0]!.modules.map((m) => m.width)).toEqual([4000, 4000, 4000]);
    expect(options[0]!.total).toBe(19428);
    expect(options[0]!.tags).toEqual(expect.arrayContaining(['cheapest', 'equal']));
  });

  it('modular S500: base + 2 additional modules, 20 739 €', () => {
    const s500 = byFamily('S500');
    expect(s500.total).toBe(20739);
    expect(s500.modules.filter((m) => m.role === 'base')).toHaveLength(1);
    expect(s500.modules.reduce((a, m) => a + m.width, 0)).toBe(12000);
  });

  it('two modules are only possible as S500 double without central post, 26 835 €', () => {
    const d = byFamily('S500_DOUBLE');
    expect(d.modules).toHaveLength(2);
    expect(d.total).toBe(26835);
    expect(d.tags).toContain('fewest');
  });

  it('modules always cover the terrace exactly', () => {
    for (const o of options) expect(o.modules.reduce((a, m) => a + (m.row === 0 ? m.width : 0), 0)).toBe(12000);
  });

  it('S400 joints are separate pergolas (double posts), S500 shares posts', () => {
    expect(byFamily('S400').posts).toBe(6);
    expect(byFamily('S500').posts).toBe(4);
  });
});

describe('composer: sizes the catalogue cannot build directly', () => {
  it('depth below 2000 mm: no options, suggests 2000 mm', () => {
    const r = compose({ mount: 'wall', width: 4000, depth: 1800 }, cat);
    expect(r.options).toEqual([]);
    expect(r.suggestions[0]).toMatchObject({ code: 'DEPTH_TOO_SMALL', params: { suggested: 2000 } });
  });

  it('depth over 8000 mm: every option needs two rows (S400 as two separate pergolas)', () => {
    const r = compose({ mount: 'wall', width: 4000, depth: 9000 }, cat);
    expect(r.options.some((o) => o.family === 'S500')).toBe(true);
    expect(r.options.every((o) => o.family !== 'S500_DOUBLE' && o.rows === 2)).toBe(true);
  });

  it('S400 depth off the 200 mm louvre grid is built at the next step with a warning', () => {
    const r = compose({ mount: 'free', width: 4000, depth: 4100 }, cat);
    const s400 = r.options.find((o) => o.family === 'S400')!;
    expect(s400.depth).toBe(4200);
    expect(s400.issues).toContainEqual(expect.objectContaining({ code: 'DEPTH_SNAPPED' }));
  });

  it('single pergola size still returns one-module options', () => {
    const r = compose({ mount: 'wall', width: 3000, depth: 4000 }, cat);
    expect(r.options[0]!.modules).toHaveLength(1);
    expect(r.options[0]!.total).toBe(8625);
  });
});

describe('composer: louvre direction (S400 p.13 "PARALLEL / PERPENDICULAR LOUVRES", S500 p.14 types B/C)', () => {
  const par = compose({ mount: 'wall', width: 12000, depth: 2000 }, cat);
  const per = compose({ mount: 'wall', width: 12000, depth: 2000, louvres: 'perpendicular' }, cat);

  it('perpendicular louvres 2000 mm long: two S400 2000 × 6000 = 2 × 9 553 € (or 7000 + 5000 = 10 773 + 8 333)', () => {
    const o = per.options[0]!;
    expect(o.family).toBe('S400');
    expect(o.total).toBe(19106);
    expect(o.modules.every((m) => m.louvreLength === 2000 && m.louvreAxis === 'y' && m.depth === 2000)).toBe(true);
    expect(o.modules.reduce((a, m) => a + m.width, 0)).toBe(12000);
    expect(o.modules.every((m) => m.mount === 'wall')).toBe(true);
    expect(o.posts).toBe(2 * o.modules.length);
  });

  it('perpendicular is cheaper here than parallel (19 428 €)', () => {
    expect(par.options[0]!.total).toBe(19428);
    expect(per.options[0]!.total).toBeLessThan(par.options[0]!.total);
    expect(par.options[0]!.modules.every((m) => m.louvreAxis === 'x' && m.louvreLength === m.width)).toBe(true);
  });

  it('perpendicular S400: length along the wall snaps to the 200 mm louvre pitch', () => {
    const o = compose({ mount: 'wall', width: 12100, depth: 2000, louvres: 'perpendicular' }, cat).options.find((x) => x.family === 'S400')!;
    expect(o.width).toBe(12200);
    expect(o.issues.some((i) => i.code === 'DEPTH_SNAPPED')).toBe(true);
  });

  it('S400 deeper than 7000 at a wall: back row on brackets, front row freestanding (4 posts each)', () => {
    const o = compose({ mount: 'wall', width: 4000, depth: 10000 }, cat).options.find((x) => x.family === 'S400')!;
    expect(o.rows).toBe(2);
    expect(o.modules.map((m) => m.mount)).toEqual(['wall', 'free']);
    expect(o.posts).toBe(6);
  });
});
