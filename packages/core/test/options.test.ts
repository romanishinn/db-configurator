import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { compose, priceOptions } from '../src';
import { loadCatalog } from '../src/node';

const cat = loadCatalog(join(__dirname, '../../../data/catalog/2026-07'), 'catalog-2026-07');
const opts = compose({ mount: 'wall', width: 12000, depth: 2000 }, cat).options;
const s400 = opts.find((o) => o.family === 'S400')!; // 3 × 4000 × 2000, 6 posts
const s500 = opts.find((o) => o.family === 'S500')!; // 3 modules, 4 posts
const dbl = opts.find((o) => o.family === 'S500_DOUBLE')!; // 6500 + 5500 × 2000
const sum = (r: { lines: { code: string; amount: number }[] }, code: string) => r.lines.filter((l) => l.code === code).reduce((a, l) => a + l.amount, 0);

describe('pergola options — values from the catalogue pages', () => {
  it('LED white in 5 louvres, S400 4000 wide (3501–4000 column, p.22): 3 × 1 072 €, one remote channel per module', () => {
    const r = priceOptions(s400, { ledLouvres: { colour: 'white', louvres: 5 } }, cat);
    expect(sum(r, 'OPT_LED_LOUVRES')).toBe(3 * 1072);
    expect(r.channels).toBe(3);
  });
  it('S500 double: LED RGB (5+5) at 6500 = 2 110 €, at 5500 = 1 909 € (p.48)', () => {
    const r = priceOptions(dbl, { ledLouvres: { colour: 'rgb', louvres: 5 } }, cat);
    expect(r.lines.map((l) => l.amount).sort()).toEqual([1909, 2110].sort());
  });
  it('gutter LED type B white: S400 4000 × 2000 = 1 076 € (p.23); double 6500 × 2000 = 1 493 € (S500 p.50)', () => {
    expect(sum(priceOptions(s400, { ledGutter: 'bwhite' }, cat), 'OPT_LED_GUTTER')).toBe(3 * 1076);
    expect(priceOptions(dbl, { ledGutter: 'bwhite' }, cat).lines.find((l) => l.params!.module === '6500×2000')!.amount).toBe(1493);
  });
  it('thermal insert: S400 table starts at projection 2600 -> 4000 × 2000 billed as 4000 × 2600 = 611 € (p.21)', () => {
    const r = priceOptions(s400, { thermal: true }, cat);
    expect(sum(r, 'OPT_THERMAL')).toBe(3 * 611);
    expect(r.issues.some((i) => i.code === 'OPT_BILLED_AT_TABLE_MIN')).toBe(true);
  });
  it('sensors: S400 separate pergolas need a wind sensor each (3 × 102 €); joined S500 = one set 342 € + temperature 60 € per further module', () => {
    expect(sum(priceOptions(s400, { sensors: 'wind' }, cat), 'OPT_SENSOR')).toBe(306);
    expect(sum(priceOptions(s500, { sensors: 'set' }, cat), 'OPT_SENSOR')).toBe(342 + 2 * 60);
  });
  it('heaters model 2, 2 sets: 2 × 840 € + preparation 2 × 90 € + internal box 450 €, 2 channels (p.25)', () => {
    const r = priceOptions(s400, { heaters: { set: 'm2.single', qty: 2 } }, cat);
    expect(r.lines.map((l) => [l.code, l.amount])).toEqual([['OPT_HEATERS', 1680], ['OPT_HEATER_PREP', 180], ['OPT_INTERNAL_BOX', 450]]);
    expect(r.channels).toBe(2);
  });
  it('post height: S400 3000 mm +110 € × 6 posts; S500 3200 mm +155 € × 4 posts; above 3200 blocked', () => {
    expect(sum(priceOptions(s400, { postHeight: 3000 }, cat), 'OPT_POST_HEIGHT')).toBe(660);
    expect(sum(priceOptions(s400, { postHeight: 3200 }, cat), 'OPT_POST_HEIGHT')).toBe(6 * 159);
    expect(sum(priceOptions(s500, { postHeight: 3200 }, cat), 'OPT_POST_HEIGHT')).toBe(620);
    expect(priceOptions(s400, { postHeight: 3300 }, cat).issues[0]!.code).toBe('OPT_POST_TOO_HIGH');
  });
  it('smart Wi-Fi 510 €, audio 985 €, S500 sockets 245 € / USB 260 €', () => {
    const r = priceOptions(s500, { smart: 'wifi', audio: 1, sockets: { power: 1, usb: 1 } }, cat);
    expect(r.lines.map((l) => l.amount)).toEqual([510, 985, 245, 260]);
  });
});
