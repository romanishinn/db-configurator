"""Screen control accessories (07.2026): WIN CONTROL remotes, smart unit, solar motor kit, wind sensor,
TELECO central units for wired screen motors (pergola catalogues).

Every price is read twice (pdfplumber text and pdftotext -layout, same index -> first price after it on the line)
and both readings must agree. TELECO units must also agree between the S400 and S500 catalogues.
MANUAL: the wind sensor row (Win Screen p.49) has no extractable index/name (drawn text); index, name and the
'wired, 230 V' note were read from the page image; its price 84 € is taken from the page text (VERIFIED_BY_IMAGE).
"""
import json, os, re, subprocess
import pdfplumber

SRC = os.environ.get('SW_PDF_DIR', '/mnt/user-data/uploads/Price')
SCREEN = 'WIN-SCREEN-EN-07.2026-.pdf'
S400, S500 = 'WIN-CLIMATIC-S400-EN-07.2026.pdf', 'WIN-CLIMATIC-S500-EN-07.2026.pdf'
OUT = 'data/sunwinner/2026-07/screen-controls.json'

ITEMS = [  # (file, page, index, kind, name RU)
    (SCREEN, 48, 'RC01-06-W', 'remote', 'Пульт WIN CONTROL 6-канальный, белый'),
    (SCREEN, 48, 'RC01-06-B', 'remote', 'Пульт WIN CONTROL 6-канальный, чёрный'),
    (SCREEN, 48, 'RC02-16-W', 'remote', 'Пульт WIN CONTROL 16-канальный с дисплеем, белый'),
    (SCREEN, 48, 'RC02-16-B', 'remote', 'Пульт WIN CONTROL 16-канальный с дисплеем, чёрный'),
    (SCREEN, 48, 'WRC01-01-W', 'remote', 'Настенный выключатель WIN CONTROL 1-канальный, белый'),
    (SCREEN, 48, 'WRC01-01-B', 'remote', 'Настенный выключатель WIN CONTROL 1-канальный, чёрный'),
    (SCREEN, 49, 'WRC02-05-W', 'remote', 'Настенный выключатель WIN CONTROL 5-канальный, белый'),
    (SCREEN, 49, 'WRC02-05-B', 'remote', 'Настенный выключатель WIN CONTROL 5-канальный, чёрный'),
    (SCREEN, 48, 'WINCZ3.0', 'smart', 'WIN CONTROL Smart — управление со смартфона (ZigBee 3.0)'),
    (SCREEN, 48, 'EX-01-Z3.0', 'receiver', 'Внешний радиоприёмник WIN CONTROL'),
    (S400, 20, 'SW-TEL-TVPRS868A04B', 'pergolaUnit1', 'Блок TELECO на 1 проводной мотор (пульт перголы)'),
    (S400, 20, 'SW-TEL-TVPL4868AC4', 'pergolaUnit4', 'Блок TELECO на 4 проводных мотора (пульт перголы), вход датчика ветра'),
]
CHANNELS = {'RC01-06': 6, 'RC02-16': 16, 'WRC01-01': 1, 'WRC02-05': 5}
VERIFIED_BY_IMAGE = {'WS-S02': {'file': SCREEN, 'page': 49, 'kind': 'wind', 'name': 'Датчик ветра и солнца WIN CONTROL, проводной 230 V'}}


def text_pp(file, page):
    with pdfplumber.open(os.path.join(SRC, file)) as d:
        return d.pages[page - 1].extract_text() or ''


def text_layout(file, page):
    t = subprocess.run(['pdftotext', '-f', str(page), '-l', str(page), '-layout', os.path.join(SRC, file), '-'], capture_output=True, text=True, check=True).stdout
    return '\n'.join(re.sub(r' {2,}', ' ', ln) for ln in t.splitlines())


def price_after(text, index):
    """First 'NN €' after the index on the same line; for the TELECO block (prices printed at the block end) the
    prices in order of appearance are matched separately."""
    for ln in text.splitlines():
        i = ln.find(index)
        if i >= 0:
            m = re.search(r'(\d{1,4}) ?€', ln[i + len(index):])
            if m:
                return int(m.group(1))
    return None


def teleco(text):
    """TELECO block: two indices on one line, prices '200 €' / '330 €' appear later in the block, in order."""
    i = text.find('WIRED MOTORS FOR WIN SCREEN')
    block = text[i:i + 2500]
    prices = [int(p) for p in re.findall(r'(\d{3}) ?€', block)]
    return prices[:2]


def build():
    items = []
    for file, page, idx, kind, name in ITEMS:
        if kind.startswith('pergolaUnit'):
            continue
        a, b = price_after(text_pp(file, page), idx), price_after(text_layout(file, page), idx)
        if a is None or a != b:
            raise SystemExit(f'{idx} p{page}: readings differ {a} vs {b}')
        it = {'index': idx, 'kind': kind, 'name': name, 'price': a, 'source': {'file': file, 'page': page}}
        ch = CHANNELS.get(idx[:-2])
        if ch:
            it['channels'] = ch
        items.append(it)
    t = {f: {r: teleco(fn(f, p)) for r, fn in (('pp', text_pp), ('layout', text_layout))} for f, p in ((S400, 20), (S500, 45))}
    vals = {tuple(v) for d in t.values() for v in d.values()}
    if len(vals) != 1 or len(next(iter(vals))) != 2:
        raise SystemExit(f'TELECO prices differ: {t}')
    p1, p4 = next(iter(vals))
    for (file, page, idx, kind, name), price in zip([x for x in ITEMS if x[3].startswith('pergolaUnit')], (p1, p4)):
        items.append({'index': idx, 'kind': kind, 'name': name, 'price': price, 'motors': 1 if kind == 'pergolaUnit1' else 4,
                      'source': {'file': file, 'page': page, 'also': {'file': S500, 'page': 45}}})
    # wind sensor: price from the page text (single '€' under WEATHER AUTOMATION), index/name from the image
    for idx, v in VERIFIED_BY_IMAGE.items():
        prices = []
        for fn in (text_pp, text_layout):
            tx = fn(v['file'], v['page'])
            j = tx.find('WEATHER AUTOMATION')
            prices.append([int(p) for p in re.findall(r'(\d{2,4}) ?€', tx[j:])])
        if prices[0] != prices[1] or len(prices[0]) != 1:
            raise SystemExit(f'{idx}: expected one price under WEATHER AUTOMATION, got {prices}')
        items.append({'index': idx, 'kind': v['kind'], 'name': v['name'], 'price': prices[0][0], 'source': {'file': v['file'], 'page': v['page']}, 'verifiedByImage': True})
    # solar motor kit (p.47): motor + panel
    reads = []
    for fn in (text_pp, text_layout):
        m = re.search(r'(\d{3}) ?€ MOTOR ZIP (SRZM45-(\d+)/17-EL/D-Z3\.0) \+.*?SP-B-01.*?(\d{3}) (\d{3})', fn(SCREEN, 47))
        reads.append(m.groups() if m else None)
    if reads[0] != reads[1] or not reads[0]:
        raise SystemExit(f'solar kit readings differ: {reads}')
    price, idx, nm, ma, mf = reads[0]
    solar = {'index': idx + ' + SP-B-01', 'control': 'solar', 'nm': int(nm), 'price': int(price), 'minWidth': {'adaptive': int(ma), 'flush': int(mf)}}
    out = {'source': {'note': __doc__.strip()}, 'items': items}
    with open(OUT, 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    # add the solar kit to the motor list
    mp = 'data/sunwinner/2026-07/screen-motors.json'
    m = json.load(open(mp))
    m['motors'] = [x for x in m['motors'] if x['control'] != 'solar'] + [solar]
    json.dump(m, open(mp, 'w'), ensure_ascii=False, indent=1)
    print(f'{len(items)} control items; TELECO {p1}/{p4} € (S400 p.20 = S500 p.45); solar kit {solar["price"]} € {solar["nm"]} Nm')


if __name__ == '__main__':
    build()
