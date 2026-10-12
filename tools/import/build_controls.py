"""Screen motors and control accessories of three brands (Win Screen catalogue 07.2026) + TELECO units.

Brands (page logos checked on the page images): WIN CONTROL — Sun Winner's own (pp.47–49), YOODA (pp.51–53,
divider page 50), Somfy (pp.54–58, logo on p.54).

Motors: reading A = bordered tables (pdfplumber, lines strategy; left table NM/RPM/PRICE/MODEL/INDEX, right table
min. roller widths, rows matched by their vertical position, merged MODEL/RPM cells filled down within a block);
reading B = pdftotext -layout (index -> first price on the same line, last two 3-digit numbers = min widths).
Both must agree for every motor; a field missing in B (Somfy solar kit price printed on the battery line) is
checked against pdfplumber text order instead (index line followed by the kit price).
Accessories: reading A = table rows [index, name, description, (frequency), warranty, price]; reading B = layout
line of the index -> first price after it. Both must agree.
TELECO central units (pergola catalogues S400 p.20 = S500 p.45) and the WIN CONTROL wind sensor WS-S02
(Win Screen p.49, index/name read from the page image, price from the text: VERIFIED_BY_IMAGE) as before.
"""
import json, os, re, subprocess
import pdfplumber

SRC = os.environ.get('SW_PDF_DIR', '/mnt/user-data/uploads/Price')
SCREEN = 'WIN-SCREEN-EN-07.2026-.pdf'
S400, S500 = 'WIN-CLIMATIC-S400-EN-07.2026.pdf', 'WIN-CLIMATIC-S500-EN-07.2026.pdf'
OUT = 'data/sunwinner/2026-07'
BRAND_OF_PAGE = {47: 'wincontrol', 48: 'wincontrol', 49: 'wincontrol', 51: 'yooda', 52: 'yooda', 53: 'yooda',
                 54: 'somfy', 55: 'somfy', 56: 'somfy', 57: 'somfy', 58: 'somfy'}
MOTOR_PAGES = {51: 'wired', 52: 'radio', 54: 'wired', 56: 'radio', 57: 'solar'}
ACCESSORY_PAGES = [48, 49, 51, 52, 53, 55, 58]
PRICE = re.compile(r'(\d{1,4}) ?€')
INDEX = re.compile(r'\b(SW-[A-Z0-9-]+|[A-Z]{1,4}\d{2}-\d{2}-[WB]|WINCZ3\.0|EX-01-Z3\.0)\b')


def layout(file, page):
    t = subprocess.run(['pdftotext', '-f', str(page), '-l', str(page), '-layout', os.path.join(SRC, file), '-'], capture_output=True, text=True, check=True).stdout
    return [re.sub(r' {2,}', ' ', ln) for ln in t.splitlines()]


def layout_index_map(lines):
    out = {}
    for ln in lines:
        for m in INDEX.finditer(ln):
            idx = m.group(1)
            p = PRICE.search(ln[m.end():])
            mins = re.findall(r'(?<![\d,.])(\d{3})(?![\d,.])', ln[m.end():])
            before = PRICE.findall(ln[:m.start()])
            out.setdefault(idx, {'price': int(p.group(1)) if p else None, 'before': int(before[-1]) if before else None,
                                 'mins': [int(x) for x in mins[-2:]] if len(mins) >= 2 else None})
    return out


def motors_from_tables(page):
    tables = page.find_tables({'vertical_strategy': 'lines', 'horizontal_strategy': 'lines'})
    left = next(t for t in tables if 'INDEX' in [(c or '').strip() for c in t.extract()[0]])
    rows = left.extract()
    hdr = [(c or '').strip() for c in rows[0]]
    col = {k: hdr.index(k) for k in ('NM', 'RPM', 'PRICE', 'MODEL', 'INDEX')}
    # right table: min widths are its last two columns; match rows by top coordinate
    right = [t for t in tables if t is not left and len(t.extract()[0]) >= 4]
    mins_by_y = {}
    for t in right:
        for r, cells in zip(t.rows, t.extract()):
            vals = [(c or '').strip() for c in cells]
            if len(vals) >= 2 and re.fullmatch(r'\d{3}', vals[-1]) and re.fullmatch(r'\d{3}', vals[-2]):
                mins_by_y[round(r.bbox[1])] = [int(vals[-2]), int(vals[-1])]
    out, model, rpm = [], None, None
    for r, cells in zip(left.rows, rows):
        v = [(c or '').replace('\n', ' ').strip() for c in cells]
        if not any(v):
            model = rpm = None  # blank separator row = new block
            continue
        if v[col['INDEX']] in ('', 'INDEX') or v[col['NM']] in ('', '-', 'NM'):
            continue
        model = v[col['MODEL']] or model
        rpm = v[col['RPM']] or rpm
        p = PRICE.search(v[col['PRICE']])
        y = round(r.bbox[1])
        mins = mins_by_y.get(y) or next((m for yy, m in mins_by_y.items() if abs(yy - y) <= 2), None)
        nm_txt = v[col['NM']]
        out.append({'index': v[col['INDEX']], 'nm': int(re.match(r'\d+', nm_txt).group()), 'short': 'short' in nm_txt,
                    'rpm': rpm, 'model': model, 'price': int(p.group(1)) if p else None, 'mins': mins})
    return out


def accessories_from_tables(page):
    out = []
    for t in page.find_tables({'vertical_strategy': 'lines', 'horizontal_strategy': 'lines'}):
        for cells in t.extract():
            v = [(c or '').replace('\n', ' ').strip() for c in cells]
            v = [x for x in v if x]
            if len(v) < 4 or not INDEX.fullmatch(v[0]) or not PRICE.fullmatch(v[-1]):
                continue
            freq = next((x for x in v if 'Mhz' in x), '')
            out.append({'index': v[0], 'name': v[1], 'description': v[2], 'frequency': freq, 'price': int(PRICE.fullmatch(v[-1]).group(1))})
    return out


def classify(a, brand):
    n, d = a['name'], a['description']
    text = (n + ' ' + d).lower()
    ch = re.search(r'(\d+)-channel', d) or re.search(r'(\d+)-channel', n)
    if 'smart home' in text or 'tahoma' in text or a['index'] == 'WINCZ3.0':
        return {'kind': 'smart'}
    if 'wind' in text and 'smoove' not in text and 'charger' not in text:
        return {'kind': 'wind', 'radio': bool(a['frequency'])}
    if ch and ('remote' in text or 'transmitter' in text or 'wall switch' in text):
        return {'kind': 'remote', 'channels': int(ch.group(1)), 'wall': 'wall' in text and 'wall mount' not in text}
    if not a['frequency'] and ('rocker switch' in text or ('switch' in text and ('inis' in text or 'smoove' in text) and 'timer' not in text)):
        return {'kind': 'switch'}
    if a['index'] == 'EX-01-Z3.0':
        return {'kind': 'receiver'}
    return None


def build():
    src = os.path.join(SRC, SCREEN)
    motors, items, problems = [], [], []
    # WIN CONTROL motors (p.47): rows "NM PRICE ... INDEX ... minA minF" in both readings
    wm = re.compile(r'(?:^|\s)(\d{1,2})(?: \(short\))?\s+(?:17\s+)?(\d{2,3}) ?€.*?\b((?:WS|W|R)Z?M45-\d+/17-EL/D(?:-Z3\.0)?)\b.*?(\d{3})\s+(\d{3})\s*$')
    with pdfplumber.open(src) as d:
        a = [m.groups() for m in (wm.search(ln) for ln in (d.pages[46].extract_text() or '').splitlines()) if m]
    b = [m.groups() for m in (wm.search(ln) for ln in layout(SCREEN, 47)) if m]
    if a != b or len(a) != 7:
        problems.append(('wincontrol motors', a, b))
    for nm, price, idx, ma, mf in a:
        motors.append({'brand': 'wincontrol', 'index': idx, 'model': 'WIN CONTROL', 'control': 'radio' if idx.startswith('R') else 'wired',
                       'nm': int(nm), 'price': int(price), 'minWidth': {'adaptive': int(ma), 'flush': int(mf)}, 'source': {'file': SCREEN, 'page': 47}})
    kit = [re.search(r'(\d{3}) ?€ MOTOR ZIP (SRZM45-(\d+)/17-EL/D-Z3\.0) \+.*?SP-B-01.*?(\d{3}) (\d{3})', t) for t in
           ('\n'.join(l for l in layout(SCREEN, 47)), pdfplumber.open(src).pages[46].extract_text())]
    if not all(kit) or kit[0].groups() != kit[1].groups():
        problems.append(('wincontrol solar kit', kit))
    price, idx, nm, ma, mf = kit[0].groups()
    motors.append({'brand': 'wincontrol', 'index': idx + ' + SP-B-01', 'model': 'WIN CONTROL Solar', 'control': 'solar', 'nm': int(nm), 'price': int(price),
                   'minWidth': {'adaptive': int(ma), 'flush': int(mf)}, 'source': {'file': SCREEN, 'page': 47}})
    # YOODA and Somfy motors
    with pdfplumber.open(src) as d:
        for pg, control in MOTOR_PAGES.items():
            A = motors_from_tables(d.pages[pg - 1])
            B = layout_index_map(layout(SCREEN, pg))
            text_lines = (d.pages[pg - 1].extract_text() or '').splitlines()
            for m in A:
                bb = B.get(m['index'])
                if not bb:
                    problems.append((pg, m['index'], 'missing in layout'))
                    continue
                bprice = bb['before']  # motor rows print the price before the index
                if bprice is None and control == 'solar':
                    # kit price printed on the following battery line: index line, then 'NNN €' as the next price
                    i = next(k for k, ln in enumerate(text_lines) if m['index'] in ln)
                    nxt = next((PRICE.search(ln) for ln in text_lines[i + 1:i + 4] if PRICE.search(ln)), None)
                    bprice = int(nxt.group(1)) if nxt else None
                if m['price'] != bprice or m['mins'] != bb['mins']:
                    problems.append((pg, m['index'], m['price'], bprice, m['mins'], bb['mins']))
                    continue
                motors.append({'brand': BRAND_OF_PAGE[pg], 'index': m['index'], 'model': m['model'], 'rpm': m['rpm'], 'control': control,
                               'nm': m['nm'], 'short': m['short'], 'price': m['price'], 'minWidth': {'adaptive': m['mins'][0], 'flush': m['mins'][1]},
                               'source': {'file': SCREEN, 'page': pg}})
        # accessories
        for pg in ACCESSORY_PAGES:
            B = layout_index_map(layout(SCREEN, pg))
            for a in accessories_from_tables(d.pages[pg - 1]):
                c = classify(a, BRAND_OF_PAGE[pg])
                if not c:
                    continue
                bb = B.get(a['index'])
                if not bb or bb['price'] != a['price']:
                    problems.append((pg, a['index'], a['price'], bb and bb['price']))
                    continue
                items.append({'brand': BRAND_OF_PAGE[pg], 'index': a['index'], 'name': a['name'], 'description': a['description'],
                              'price': a['price'], **c, 'source': {'file': SCREEN, 'page': pg}})
    # TELECO units: any brand of wired motor (WIN CONTROL, YOODA, Somfy — confirmed by D&B Solutions, 12.10.2026)
    def teleco(file, page, fn):
        tx = fn(file, page)
        i = tx.find('WIRED MOTORS FOR WIN SCREEN')
        return [int(p) for p in re.findall(r'(\d{3}) ?€', tx[i:i + 2500])][:2]
    pp = lambda f, p: pdfplumber.open(os.path.join(SRC, f)).pages[p - 1].extract_text() or ''
    lt = lambda f, p: '\n'.join(layout(f, p))
    tv = {(f, n): teleco(f, p, fn) for f, p in ((S400, 20), (S500, 45)) for n, fn in (('pp', pp), ('layout', lt))}
    if len({tuple(v) for v in tv.values()}) != 1:
        problems.append(('teleco', tv))
    p1, p4 = next(iter(tv.values()))
    items += [
        {'brand': 'any', 'index': 'SW-TEL-TVPRS868A04B', 'kind': 'pergolaUnit1', 'name': 'TELECO central unit for 1 wired motor', 'price': p1, 'motors': 1,
         'source': {'file': S400, 'page': 20, 'also': {'file': S500, 'page': 45}}},
        {'brand': 'any', 'index': 'SW-TEL-TVPL4868AC4', 'kind': 'pergolaUnit4', 'name': 'TELECO central unit for 4 wired motors, wind sensor input', 'price': p4, 'motors': 4,
         'source': {'file': S400, 'page': 20, 'also': {'file': S500, 'page': 45}}},
    ]
    # WIN CONTROL wind sensor (VERIFIED_BY_IMAGE: index/name from the page image, price from text)
    prices = []
    for fn in (pp, lt):
        tx = fn(SCREEN, 49)
        j = tx.find('WEATHER AUTOMATION')
        prices.append([int(p) for p in re.findall(r'(\d{2,4}) ?€', tx[j:])])
    if prices[0] != prices[1] or len(prices[0]) != 1:
        problems.append(('WS-S02', prices))
    items.append({'brand': 'wincontrol', 'index': 'WS-S02', 'kind': 'wind', 'radio': False, 'name': 'WIN CONTROL wired wind and sun sensor',
                  'description': 'Wired wind and sun sensor, 230 V AC', 'price': prices[0][0], 'source': {'file': SCREEN, 'page': 49}, 'verifiedByImage': True})
    if problems:
        raise SystemExit('readings disagree:\n' + '\n'.join(map(str, problems)))
    json.dump({'source': {'note': __doc__.strip()}, 'motors': motors}, open(f'{OUT}/screen-motors.json', 'w'), ensure_ascii=False, indent=1)
    json.dump({'source': {'note': __doc__.strip()}, 'items': items}, open(f'{OUT}/screen-controls.json', 'w'), ensure_ascii=False, indent=1)
    from collections import Counter
    print(f'motors: {Counter((m["brand"], m["control"]) for m in motors)}')
    print(f'items: {Counter((i["brand"], i["kind"]) for i in items)}')


if __name__ == '__main__':
    build()
