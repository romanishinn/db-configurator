import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { coatingSurcharges, lookupGrid, priceScreenIn, screenControlLines, selectScreen } from '../src';
import { loadCatalog } from '../src/node';

const cat = loadCatalog(join(__dirname, '../../../data/sunwinner/2026-07'), 'sunwinner-2026-07');
const cell = (t: string, w: number, h: number) => lookupGrid(cat.tables[t]!, w, h).price;

describe('Win Screen ZIP grids (values read from the catalogue pages)', () => {
  it('ZIP 110 adaptive, p.21', () => {
    expect(cell('zip110.adaptive', 1000, 1000)).toBe(375);
    expect(cell('zip110.adaptive', 3500, 1000)).toBe(850);
    expect(cell('zip110.adaptive', 3600, 1000)).toBe(960);
    expect(cell('zip110.adaptive', 4000, 4000)).toBe(1854);
    expect(cell('zip110.adaptive', 4100, 1000)).toBe(1166);
    expect(cell('zip110.adaptive', 5000, 3000)).toBe(1926);
    expect(() => cell('zip110.adaptive', 4500, 3100)).toThrow(); // not produced above 3000 for widths > 4000
  });
  it('ZIP 130 adaptive, p.24', () => {
    expect(cell('zip130.adaptive', 4200, 2900)).toBe(1916);
    expect(cell('zip130.adaptive', 4200, 6000)).toBe(2829);
    expect(cell('zip130.adaptive', 5400, 6000)).toBe(3459);
    expect(cell('zip130.adaptive', 7000, 1000)).toBe(2031);
    expect(cell('zip130.adaptive', 7000, 3000)).toBe(2883);
    expect(() => cell('zip130.adaptive', 5500, 3100)).toThrow();
  });
});

describe('ZIP pricing on a pergola side', () => {
  it('3870 × 2590 opening -> ZIP 110 billed 3900 × 2600, 10 Nm zone, WIN CONTROL wired 10 Nm 132 €', () => {
    const r = selectScreen({ width: 3870, height: 2590 }, cat);
    const b = r.best!;
    expect(b.system).toBe('zip110.adaptive');
    expect(b.billed).toEqual({ width: 3900, height: 2600 });
    expect(b.gridPrice).toBe(1433);
    expect(b.torqueNm).toBe(10);
    expect(b.motor.index).toBe('WZM45-10/17-EL/D');
    expect(b.total).toBe(1433 + 132);
  });
  it('torque zones follow the staircase: 3000 × 2000 is 8 Nm, 2000 × 2000 is 6 Nm, 4000 × 4000 is 15 Nm (-> 20 Nm motor)', () => {
    expect(priceScreenIn('zip110.adaptive', { width: 3000, height: 2000 }, cat).option!.torqueNm).toBe(8);
    expect(priceScreenIn('zip110.adaptive', { width: 2000, height: 2000 }, cat).option!.torqueNm).toBe(6);
    const big = priceScreenIn('zip110.adaptive', { width: 4000, height: 4000 }, cat).option!;
    expect(big.torqueNm).toBe(15);
    expect(big.motor.nm).toBe(20);
  });
  it('radio: the cheapest motor with enough torque — 2-way 20 Nm 156 € is cheaper than 10 Nm 160 € (p.47)', () => {
    expect(selectScreen({ width: 3870, height: 2590, control: 'radio' }, cat).best!.motor).toMatchObject({ index: 'RZM45-20/17-EL/D-Z3.0', price: 156 });
  });
  it('fabric surcharge on the actual size: Soltis 92, 3870 × 2590 = 10.02 m² × 15 €', () => {
    const b = selectScreen({ width: 3870, height: 2590, fabric: 'soltis-92' }, cat).best!;
    expect(b.lines.find((l) => l.code === 'FABRIC_SURCHARGE')!.amount).toBe(150.35);
  });
  it('wider than 5000 -> ZIP 130; 6820 needs Serge 600/100 (Soltis 7635 max 6000 on ZIP 130)', () => {
    const r = selectScreen({ width: 6820, height: 2560 }, cat);
    expect(r.best).toBeNull();
    expect(r.issues.find((i) => i.code === 'FABRIC_MAX_WIDTH')!.params).toMatchObject({ maxWidth: 6000 });
    const b = selectScreen({ width: 6820, height: 2560, fabric: 'serge-600' }, cat).best!;
    expect(b.system).toBe('zip130.adaptive');
    expect(b.billed).toEqual({ width: 6900, height: 2600 });
    expect(b.motor.nm).toBe(30);
  });
  it('collection limits: Serge 100 on ZIP 110 wider than 4000 only up to 2800 high -> ZIP 130', () => {
    expect(priceScreenIn('zip110.adaptive', { width: 4500, height: 2900, fabric: 'serge-100' }, cat).issues[0]!.code).toBe('FABRIC_MAX_HEIGHT');
    expect(selectScreen({ width: 4500, height: 2900, fabric: 'serge-100' }, cat).best!.system).toBe('zip130.adaptive');
  });
  it('collection limits: Soltis 92 on ZIP 130 at most 5000 wide; Soltis 7635 at most 6000', () => {
    const r = selectScreen({ width: 5500, height: 2500, fabric: 'soltis-92' }, cat);
    expect(r.best).toBeNull();
    expect(r.issues.map((i) => i.code)).toContain('FABRIC_MAX_WIDTH');
    expect(selectScreen({ width: 6500, height: 2500 }, cat).best).toBeNull();
    expect(selectScreen({ width: 6500, height: 2500, fabric: 'serge-600' }, cat).best!.system).toBe('zip130.adaptive');
  });
  it('ZIP coating % applies to the catalogue price of the screen with Soltis 7635 (Win Screen p.20 note)', () => {
    const b = selectScreen({ width: 3870, height: 2590 }, cat).best!;
    expect(coatingSurcharges([{ system: 'SCREEN_ZIP', base: b.gridPrice, color: '07' }], cat).total).toBe(114.64); // 8 % of 1433
  });
});

describe('screen control (Win Screen p.47–49, TELECO S400 p.20 / S500 p.45)', () => {
  it('solar kit 332 € (20 Nm) — only where 20 Nm is enough', () => {
    expect(selectScreen({ width: 3870, height: 2590, control: 'solar' }, cat).best!.motor).toMatchObject({ control: 'solar', price: 332, nm: 20 });
    expect(selectScreen({ width: 6820, height: 2560, fabric: 'serge-600', control: 'solar' }, cat).best).toBeNull(); // 30 Nm zone
  });
  it('one screen with remote: 6-channel handheld 33 € (cheapest handheld with enough channels)', () => {
    const r = screenControlLines(['remote'], {}, cat);
    expect(r.lines.map((l) => [l.params!.index, l.amount])).toEqual([['RC01-06-W', 33]]);
  });
  it('seven screens with remote -> 16-channel 39 €; chosen 1-channel wall switch warns', () => {
    expect(screenControlLines(Array(7).fill('remote'), {}, cat).lines[0]!.params!.index).toBe('RC02-16-W');
    expect(screenControlLines(['remote', 'remote'], { remote: 'WRC01-01-W' }, cat).issues[0]!.code).toBe('REMOTE_TOO_FEW_CHANNELS');
  });
  it('smart: one WIN CONTROL Smart unit 60 € for the project', () => {
    expect(screenControlLines(['smart', 'smart'], {}, cat).total).toBe(60);
  });
  it('wired from the pergola remote: TELECO 1 motor 200 €, 2–4 motors one 4-unit 330 €, 5 motors 330 + 200', () => {
    expect(screenControlLines(['pergola'], {}, cat).total).toBe(200);
    expect(screenControlLines(['pergola', 'pergola'], {}, cat).total).toBe(330);
    expect(screenControlLines(Array(5).fill('pergola'), {}, cat).total).toBe(530);
  });
  it('wind sensor WS-S02 84 €, once per project', () => {
    expect(screenControlLines(['remote', 'pergola'], { wind: true }, cat).lines.map((l) => l.amount)).toEqual([33, 200, 84]);
  });
});
