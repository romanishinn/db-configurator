import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { compose, coatingPercent, pricePergola, priceOptions } from '../src';
import { loadCatalog } from '../src/node';

const cat = loadCatalog(join(__dirname, '../../../data/catalog/2026-07'), 'catalog-2026-07');
const sum = (r: { lines: { code: string; amount: number }[] }, code: string) => r.lines.filter((l) => l.code === code).reduce((a, l) => a + l.amount, 0);
const blocks = (r: { issues: { severity: string; code: string }[] }) => r.issues.filter((i) => i.severity === 'block').map((i) => i.code);

// Golden values read from the page images of the sliding-roof price list 07.2026.
describe('Slide: golden prices from the catalogue', () => {
  const cases: [string, Parameters<typeof pricePergola>[0], number, number][] = [
    // name, config, price, built projection
    ['wall base 2500 × 2500 (p.5, 10 louvres, 2526–2566)', { model: 'SLIDE', mount: 'wall', width: 2500, projection: 2550 }, 12725, 2550],
    ['wall base 4000 × 7000 (p.5, 29 louvres, 6908–6948)', { model: 'SLIDE', mount: 'wall', width: 4000, projection: 6920 }, 26989, 6920],
    ['wall additional 4000 × row "4400" (p.6, 18 louvres)', { model: 'SLIDE', mount: 'wall', module: 'add', width: 4000, projection: 4400 }, 19688, 4400],
    ['wall additional 4000 × row "6000" (p.6, 25 louvres)', { model: 'SLIDE', mount: 'wall', module: 'add', width: 4000, projection: 6000 }, 23807, 6000],
    ['freestanding base 4000 × 7000 (p.7)', { model: 'SLIDE', mount: 'free', width: 4000, projection: 6948 }, 27947, 6948],
    ['freestanding additional 2500 × 2500 (p.8)', { model: 'SLIDE', mount: 'free', module: 'add', width: 2500, projection: 2526 }, 12545, 2526],
    ['freestanding additional 4000 × 7000 (p.8)', { model: 'SLIDE', mount: 'free', module: 'add', width: 4000, projection: 6930 }, 26609, 6930],
    ['roof module 3000 × row "5000" (p.9, base = additional)', { model: 'SLIDE', mount: 'roof', module: 'add', width: 3000, projection: 5080 }, 17543, 5080],
  ];
  for (const [name, cfg, price, built] of cases) {
    it(name, () => {
      const r = pricePergola(cfg, cat);
      expect(blocks(r)).toEqual([]);
      expect(r.total).toBe(price);
      expect(r.lines[0]!.params!.projection).toBe(built);
    });
  }
});

describe('Slide: projection is set by the louvre count', () => {
  it('between two ranges: nearest range — 6500 is made 6487 (row "6500", 27 louvres, 25 998 €)', () => {
    const r = pricePergola({ model: 'SLIDE', mount: 'wall', width: 4000, projection: 6500 }, cat);
    expect(r.lines[0]!.params).toMatchObject({ projection: 6487, louvers: 27, rangeFrom: 6447, rangeTo: 6487 });
    expect(r.total).toBe(25998);
    expect(r.issues.map((i) => i.code)).toContain('SLIDE_PROJECTION_SNAPPED');
  });
  it('7000 is made 6948 (the longest range), 7100 is not made as one module', () => {
    expect(pricePergola({ model: 'SLIDE', mount: 'wall', width: 4000, projection: 7000 }, cat).lines[0]!.params!.projection).toBe(6948);
    expect(blocks(pricePergola({ model: 'SLIDE', mount: 'wall', width: 4000, projection: 7100 }, cat))).toEqual(['SIZE_OUT_OF_RANGE']);
  });
  it('width between steps is billed at the next step (note 6): 3900 → 4000 column', () => {
    const r = pricePergola({ model: 'SLIDE', mount: 'wall', width: 3900, projection: 2550 }, cat);
    expect(r.total).toBe(14862);
  });
  it('narrower than 2500 is not in the list', () => {
    expect(blocks(pricePergola({ model: 'SLIDE', mount: 'wall', width: 2400, projection: 3000 }, cat))).toEqual(['SIZE_OUT_OF_RANGE']);
  });
});

describe('Slide: composer', () => {
  const only = (req: Parameters<typeof compose>[0]) => compose({ ...req, families: ['SLIDE'] }, cat).options;

  it('wall 4000 × 6500: one module, built 6487, two required posts (projection above 6000, p.5) 2 × 765 € (p.11)', () => {
    const o = only({ mount: 'wall', width: 4000, depth: 6500 })[0]!;
    expect(o.family).toBe('SLIDE');
    expect(o.modules).toHaveLength(1);
    expect(o.depth).toBe(6487);
    expect(o.requiredPosts).toMatchObject({ qty: 2, unit: 765, amount: 1530 });
    expect(o.total).toBe(25998 + 1530);
    expect(o.posts).toBe(2);
    expect(o.issues.map((i) => i.code)).toContain('DEPTH_SNAPPED');
  });
  it('freestanding 8000 × 7000: base + additional 4000 × 6948 (p.7 + p.8), 3 required posts', () => {
    const o = only({ mount: 'free', width: 8000, depth: 7000 })[0]!;
    expect(o.modules.map((m) => m.role).sort()).toEqual(['add', 'base']);
    expect(o.requiredPosts!.qty).toBe(3);
    expect(o.total).toBe(27947 + 26609 + 3 * 765);
  });
  it('wall 4000 × 12000: two rows of 6000 (p.5 + p.6), no required post at exactly 6000', () => {
    const o = only({ mount: 'wall', width: 4000, depth: 12000 })[0]!;
    expect(o.modules.map((m) => m.projection)).toEqual([6000, 6000]);
    expect(o.requiredPosts).toBeUndefined();
    expect(o.total).toBe(24722 + 23807);
  });
  it('perpendicular louvres at the wall: the beam on the wall needs no post', () => {
    const o = only({ mount: 'wall', width: 7000, depth: 4000, louvres: 'perpendicular' })[0]!;
    expect(o.modules[0]!.projection).toBe(6948);
    expect(o.requiredPosts!.qty).toBe(1);
  });
  it('at most two modules per direction (drawings p.6, p.8)', () => {
    expect(only({ mount: 'wall', width: 12000, depth: 3000 })).toEqual([]);
    expect(only({ mount: 'wall', width: 4000, depth: 15000 })).toEqual([]);
  });
  it('Slide is listed among all families when not filtered', () => {
    const all = compose({ mount: 'wall', width: 4000, depth: 4000 }, cat).options;
    expect(all.some((o) => o.family === 'SLIDE')).toBe(true);
  });
});

describe('Slide: options (p.11–15)', () => {
  const o = compose({ mount: 'wall', width: 4000, depth: 6500, families: ['SLIDE'] }, cat).options[0]!; // 4000 × 6487, 2 posts + 2 required
  it('thermal insulation 4000 × 6500 row = 1 658 € (p.11)', () => {
    expect(sum(priceOptions(o, { thermal: true }, cat), 'OPT_THERMAL')).toBe(1658);
  });
  it('LED in the gutter, white 4000 × 6500 = 1 999 €, white + RGB = 4 266 € (p.13); RGB only is not offered', () => {
    expect(sum(priceOptions(o, { ledGutter: 'bwhite' }, cat), 'OPT_LED_GUTTER')).toBe(1999);
    expect(sum(priceOptions(o, { ledGutter: 'cwhitergb' }, cat), 'OPT_LED_GUTTER')).toBe(4266);
    expect(blocks(priceOptions(o, { ledGutter: 'brgb' }, cat))).toEqual(['OPT_NOT_FOR_MODEL']);
  });
  it('post height 2800: 2 posts × 81 € and the 2 required posts 845 − 765 € (p.11)', () => {
    const r = priceOptions(o, { postHeight: 2800 }, cat);
    expect(sum(r, 'OPT_POST_HEIGHT')).toBe(162);
    expect(sum(r, 'OPT_REQUIRED_POST_HEIGHT')).toBe(160);
  });
  it('post height 3100: 2 × 121 € + 2 × (887 − 765) €; up to 2600 nothing', () => {
    const r = priceOptions(o, { postHeight: 3100 }, cat);
    expect(sum(r, 'OPT_POST_HEIGHT')).toBe(242);
    expect(sum(r, 'OPT_REQUIRED_POST_HEIGHT')).toBe(244);
    expect(priceOptions(o, { postHeight: 2600 }, cat).lines).toEqual([]);
  });
  it('extra dividing post at 2600 = 765 € (p.11)', () => {
    expect(sum(priceOptions(o, { intermediatePosts: 1 }, cat), 'OPT_INTERMEDIATE_POST')).toBe(765);
  });
  it('Somfy io (p.12): Eolis io 190 €, Soliris io 263 €, TaHoma Switch Pro 232 €; no rain sensor, no Bluetooth', () => {
    expect(sum(priceOptions(o, { sensors: 'wind' }, cat), 'OPT_SENSOR')).toBe(190);
    expect(sum(priceOptions(o, { sensors: 'windSun' }, cat), 'OPT_SENSOR')).toBe(263);
    expect(sum(priceOptions(o, { smart: 'wifi' }, cat), 'OPT_SMART')).toBe(232);
    expect(blocks(priceOptions(o, { sensors: 'rain' }, cat))).toEqual(['OPT_NOT_FOR_MODEL']);
    expect(blocks(priceOptions(o, { smart: 'bluetooth' }, cat))).toEqual(['OPT_NOT_FOR_MODEL']);
  });
  it('heater 4000 W set 2 292 € + preparation 86 € (p.14); vertical lamps 4 = 1 355 €, 11 = 2 701 + 224 € (p.13)', () => {
    const h = priceOptions(o, { heaters: { set: 's5.double', qty: 1 } }, cat);
    expect(sum(h, 'OPT_HEATERS')).toBe(2292);
    expect(sum(h, 'OPT_HEATER_PREP')).toBe(86);
    expect(sum(priceOptions(o, { verticalLamps: 4 }, cat), 'OPT_VERTICAL_LAMPS')).toBe(1355);
    expect(sum(priceOptions(o, { verticalLamps: 11 }, cat), 'OPT_VERTICAL_LAMPS')).toBe(2925);
  });
  it('audio 836 €, power socket 182 €, USB 247 € (p.15)', () => {
    expect(sum(priceOptions(o, { audio: 1 }, cat), 'OPT_AUDIO')).toBe(836);
    const s = priceOptions(o, { sockets: { power: 1, usb: 1 } }, cat);
    expect(s.lines.map((l) => l.amount).sort()).toEqual([182, 247]);
  });
  it('lighting in the louvres and spots in the crown are not in the Slide list', () => {
    expect(blocks(priceOptions(o, { ledLouvres: { colour: 'white', louvres: 5 } }, cat))).toEqual(['OPT_NOT_FOR_MODEL']);
    expect(blocks(priceOptions(o, { crownSpots: 8 }, cat))).toEqual(['OPT_NOT_FOR_MODEL']);
  });
});

describe('Slide: coating (p.10)', () => {
  it('fine structures: construction 6 %, louvres 4 %, whole pergola 10 %', () => {
    expect(coatingPercent('SLIDE', { construction: 'fine', roof: 'fine' }, cat)).toBe(10);
    expect(coatingPercent('SLIDE', { construction: 'fine', roof: 'standard' }, cat)).toBe(6);
    expect(coatingPercent('SLIDE', { construction: 'standard', roof: 'fine' }, cat)).toBe(4);
  });
  it('any RAL whole 14 %, wood-like whole 25 %', () => {
    expect(coatingPercent('SLIDE', { construction: 'ralAny', roof: 'ralAny' }, cat)).toBe(14);
    expect(coatingPercent('SLIDE', { construction: 'wood', roof: 'wood' }, cat)).toBe(25);
  });
});
