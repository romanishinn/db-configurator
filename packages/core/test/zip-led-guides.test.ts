import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { selectScreen } from '../src';
import { loadCatalog } from '../src/node';

const cat = loadCatalog(join(__dirname, '../../../data/catalog/2026-07'), 'catalog-2026-07');
const sum = (lines: { code: string; amount: number }[], code: string) => lines.filter((l) => l.code === code).reduce((a, l) => a + l.amount, 0);

// Golden values read from the Win Screen price list 07.2026: p.24 "Surcharge for guide rail change" (WS ZIP Z5, 1 x LED),
// p.23 control unit for WIN CONTROL lighting ON/OFF 56 €.
describe('ZIP with LED lighting in the guide rails (p.23-24)', () => {
  it('height 1000: Z5 + LED 208 €, control unit 56 €; only ZIP 130', () => {
    const r = selectScreen({ width: 3000, height: 1000, ledGuides: true }, cat);
    expect(r.best!.system).toBe('zip130.adaptive');
    expect(sum(r.best!.lines, 'SCREEN_LED_GUIDES')).toBe(208);
    expect(sum(r.best!.lines, 'SCREEN_LED_CONTROL')).toBe(56);
  });
  it('height 2590 → row 2600: 353 € (p.24, row 2600); height 6000: 700 €', () => {
    expect(sum(selectScreen({ width: 3400, height: 2590, ledGuides: true }, cat).best!.lines, 'SCREEN_LED_GUIDES')).toBe(353);
    expect(sum(selectScreen({ width: 3000, height: 6000, fabric: 'serge-600', ledGuides: true }, cat).best!.lines, 'SCREEN_LED_GUIDES')).toBe(700);
  });
  it('without LED the cheaper ZIP 110 stays possible; with LED ZIP 110 is not offered', () => {
    expect(selectScreen({ width: 3400, height: 2590 }, cat).best!.system).toBe('zip110.adaptive');
    const r = selectScreen({ width: 3400, height: 2590, ledGuides: true, system: 'zip110.adaptive' }, cat);
    expect(r.best).toBeNull();
    expect(r.issues.map((i) => i.code)).toContain('SCREEN_LED_GUIDES_NOT_IN_SYSTEM');
  });
});
