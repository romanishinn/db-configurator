import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { brandModes, coatingSurcharges, lookupGrid, pickMotor, priceScreenIn, screenControlLines, selectScreen } from '../src';
import { loadCatalog } from '../src/node';

const cat = loadCatalog(join(__dirname, '../../../data/catalog/2026-07'), 'catalog-2026-07');
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
  it('fabric fallback: 6820 wide with Soltis 7635 (OF 5 %, max 6000 on ZIP 130, p.48) -> Serge 600 (also OF 5 %, 7 EUR/m2)', () => {
    const r = selectScreen({ width: 6820, height: 2560, fabricFallback: 'sameOpenness' }, cat);
    expect(r.issues).toEqual([{ severity: 'info', code: 'FABRIC_SUBSTITUTED', params: { from: 'soltis-7635', to: 'serge-600' } }]);
    expect(r.best!.system).toBe('zip130.adaptive');
    expect(r.best!.billed).toEqual({ width: 6900, height: 2600 });
    // same price as asking for Serge 600 directly
    expect(r.best!.total).toBe(selectScreen({ width: 6820, height: 2560, fabric: 'serge-600' }, cat).best!.total);
  });
  it('fabric fallback keeps the openness: Soltis 92 (OF 4 %) has no OF 4 % alternative -> still blocked; within limits nothing changes', () => {
    const r = selectScreen({ width: 5500, height: 2500, fabric: 'soltis-92', fabricFallback: 'sameOpenness' }, cat);
    expect(r.best).toBeNull();
    expect(r.issues.map((i) => i.code)).toContain('FABRIC_MAX_WIDTH');
    const ok = selectScreen({ width: 3870, height: 2590, fabricFallback: 'sameOpenness' }, cat);
    expect(ok.issues).toEqual([]);
    expect(ok.best!.total).toBe(selectScreen({ width: 3870, height: 2590 }, cat).best!.total);
  });
  it('fabric fallback does not hide a size limit: 7200 wide is over the ZIP 130 maximum of 7000', () => {
    const r = selectScreen({ width: 7200, height: 2500, fabricFallback: 'sameOpenness' }, cat);
    expect(r.best).toBeNull();
    expect(r.issues.some((i) => i.code === 'SCREEN_SIZE_OUT_OF_RANGE' && i.params?.max === 7000)).toBe(true);
  });
  it('ZIP coating % applies to the catalogue price of the screen with Soltis 7635 (Win Screen p.20 note)', () => {
    const b = selectScreen({ width: 3870, height: 2590 }, cat).best!;
    expect(coatingSurcharges([{ system: 'SCREEN_ZIP', base: b.gridPrice, color: '07' }], cat).total).toBe(114.64); // 8 % of 1433
  });
});

describe('screen control (Win Screen p.47–49, TELECO S400 p.20 / S500 p.45)', () => {
  it('solar kit 332 € (20 Nm) — only where 20 Nm is enough', () => {
    expect(selectScreen({ width: 3870, height: 2590, control: 'solar' }, cat).best!.motor).toMatchObject({ control: 'solar', price: 332, nm: 20 });
    expect(selectScreen({ width: 3870, height: 2590, control: 'solar', brand: 'yooda' }, cat).best).toBeNull();
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
  it('wind sensor: one per pergola system — WIN CONTROL WS-S02 84 €', () => {
    expect(screenControlLines(['remote', 'pergola'], { wind: true }, cat).lines.map((l) => l.amount)).toEqual([33, 200, 84]);
    expect(screenControlLines(['remote', 'remote'], { wind: true, windSensors: 2 }, cat).lines.at(-1)!.amount).toBe(168);
  });
});

describe('motor brands (Win Screen pp.47, 51–58)', () => {
  // 3870 × 2590 on ZIP 110 = 10 Nm zone
  it('cheapest motor per brand for a 10 Nm radio screen: YOODA 107 €, WIN CONTROL 156 € (20 Nm), Somfy Altus RS 50 io 280 €', () => {
    expect(pickMotor(cat, 'yooda', 'radio', 10, 3870)).toMatchObject({ index: 'SW-Y1201015', price: 107 });
    expect(pickMotor(cat, 'wincontrol', 'radio', 10, 3870)).toMatchObject({ index: 'RZM45-20/17-EL/D-Z3.0', price: 156 });
    expect(pickMotor(cat, 'somfy', 'radio', 10, 3870)).toMatchObject({ model: 'Altus RS 50 io', price: 280 });
  });
  it('wired 10 Nm: YOODA 58 €, Somfy LT 50/12 140 €; narrow roller (700 mm) needs the YOODA short motor 83 €', () => {
    expect(pickMotor(cat, 'yooda', 'wired', 10, 3870)!.price).toBe(58);
    expect(pickMotor(cat, 'somfy', 'wired', 10, 3870)).toMatchObject({ model: 'LT 50/12', price: 140 });
    expect(pickMotor(cat, 'yooda', 'wired', 10, 600)).toMatchObject({ index: 'SW-Y1211110', price: 83 });
  });
  it('Somfy solar RS100 Solar io: 10 Nm 556 €, 15 Nm 730 €', () => {
    expect(pickMotor(cat, 'somfy', 'solar', 8, 3870)!.price).toBe(556);
    expect(pickMotor(cat, 'somfy', 'solar', 15, 3870)!.price).toBe(730);
  });
  it('modes per brand: YOODA has no solar, WIN CONTROL no wired wall switch', () => {
    expect(brandModes('yooda', cat)).toEqual(['remote', 'smart', 'pergola', 'switch']);
    expect(brandModes('wincontrol', cat)).toEqual(['remote', 'smart', 'pergola', 'solar']);
    expect(brandModes('somfy', cat)).toEqual(['remote', 'smart', 'pergola', 'switch', 'solar']);
  });
  it('YOODA project: 2 radio screens -> Artistic 5 white 43 €, Smart Home 3.0 350 €, radio wind sensor Meteo-B 107 €', () => {
    const r = screenControlLines(['remote', 'remote', 'smart'], { brand: 'yooda', wind: true }, cat);
    expect(r.lines.map((l) => [l.params!.index, l.amount])).toEqual([['SW-Y1701105', 43], ['SW-Y1197006', 350], ['SW-Y1611627', 107]]);
  });
  it('Somfy: wired with wall switches -> Inis WT 14 € per motor; wired-only wind sensor Soliris WT 92 €, with radio Eolis io 190 €', () => {
    expect(screenControlLines(['switch', 'switch'], { brand: 'somfy', wind: true }, cat).lines.map((l) => [l.params!.index, l.amount])).toEqual([['SW-S1800511', 28], ['SW-S9101473', 92]]);
    expect(screenControlLines(['remote'], { brand: 'somfy', wind: true }, cat).lines.map((l) => [l.params!.index, l.amount])).toEqual([['SW-S1870312', 71], ['SW-S1816092', 190]]);
  });
  it('own variant: own motor price per screen, own controls per project, required torque still shown', () => {
    const b = selectScreen({ width: 3870, height: 2590, brand: 'custom', control: 'radio', customMotor: { name: 'Becker', price: 200 } }, cat).best!;
    expect(b.motor).toMatchObject({ index: 'Becker', price: 200, nm: 10 });
    expect(screenControlLines(['remote'], { brand: 'custom', customControls: 150, wind: true }, cat).total).toBe(150);
  });
});

describe('pergola remote (TELECO 63 channels, included; additional 140 €, S400 p.19 / S500 p.44)', () => {
  it('3 roofs + 2 screens on the pergola remote: 5 of 63 channels, nothing extra to buy', () => {
    const r = screenControlLines(['pergola', 'pergola'], { pergolaChannels: 3 }, cat);
    const pr = r.lines.find((l) => l.code === 'CONTROL_PERGOLA_REMOTE')!;
    expect(pr.params).toMatchObject({ channels: 63, used: 5 });
    expect(pr.amount).toBe(0);
    expect(r.issues).toEqual([]);
  });
  it('more than 63 channels -> one additional remote 140 € and a warning', () => {
    const r = screenControlLines(Array(62).fill('pergola'), { pergolaChannels: 4 }, cat);
    expect(r.lines.find((l) => l.code === 'CONTROL_PERGOLA_REMOTE_EXTRA')!.amount).toBe(140);
    expect(r.issues.map((i) => i.code)).toContain('PERGOLA_REMOTE_FULL');
  });
  it('a chosen radio remote with too few channels suggests the one that fits', () => {
    const r = screenControlLines(Array(5).fill('remote'), { remote: 'WRC01-01-W' }, cat);
    expect(r.issues[0]!.params).toMatchObject({ channels: 1, screens: 5, suggest: 'RC01-06-W', suggestChannels: 6, suggestPrice: 33 });
  });
});
