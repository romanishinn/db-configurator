"""Pergola options (Win Climatic S400 / S500 07.2026): lighting, thermal insulation, sensors, smart control,
heaters, audio, posts, internal box, drainage.

Grid tables — reading A: bordered tables (pdfplumber, lines strategy); reading B: pdftotext -layout — every
table row must appear as a contiguous run of prices on the layout line that carries the row label.
Variant identity (white / RGB / RGBW / type C) follows the order printed on the page and is cross-checked:
cells that S400 and S500 share (same width, projection, variant) must be equal in both catalogues.
Scalar prices: two readings (pdfplumber text, pdftotext -layout) of the same labelled sequence must agree.
"""
import json, os, re, subprocess
import pdfplumber

SRC = os.environ.get('SW_PDF_DIR', '/mnt/user-data/uploads/Price')
S400, S500 = 'WIN-CLIMATIC-S400-EN-07.2026.pdf', 'WIN-CLIMATIC-S500-EN-07.2026.pdf'
OUT = 'data/sunwinner/2026-07'
EUR = re.compile(r'(?<!\d)(\d(?: \d{3})|\d{2,3}) ?€')
LED_COLOURS = ['white', 'rgb', 'rgbw']
GUTTER_TYPES = ['bwhite', 'brgb', 'brgbw', 'cwhitergb']


def eur(s):
    m = EUR.fullmatch((s or '').replace('\n', ' ').strip())
    return int(m.group(1).replace(' ', '')) if m else None


def layout_lines(file, page):
    t = subprocess.run(['pdftotext', '-f', str(page), '-l', str(page), '-layout', os.path.join(SRC, file), '-'], capture_output=True, text=True, check=True).stdout
    return [re.sub(r' {2,}', ' ', ln).strip() for ln in t.splitlines()]


def text_pp(file, page):
    with pdfplumber.open(os.path.join(SRC, file)) as d:
        return d.pages[page - 1].extract_text() or ''


def tables(file, page):
    with pdfplumber.open(os.path.join(SRC, file)) as d:
        return [t.extract() for t in d.pages[page - 1].find_tables({'vertical_strategy': 'lines', 'horizontal_strategy': 'lines'}) if len(t.extract()) > 3]


def parse_grid(rows, x_kind):
    """rows from find_tables -> (x values, [(label, [prices])]). x_kind: 'num' (plain widths) or 'range' ('2000 - 3000' -> 3000)."""
    hdr_i = next(i for i, r in enumerate(rows) if sum(bool(re.fullmatch(r'\d{4}( - \d{4})?', (c or '').strip())) for c in r) >= 3)
    xs = []
    for c in rows[hdr_i]:
        c = (c or '').replace('\n', ' ').strip()
        m = re.fullmatch(r'(\d{4})(?: - (\d{4}))?', c)
        if m:
            xs.append(int(m.group(2) or m.group(1)) if x_kind == 'range' else int(m.group(1)))
    body = []
    for r in rows[hdr_i + 1:]:
        cells = [(c or '').replace('\n', ' ').strip() for c in r]
        label = next((c for c in cells if c and eur(c) is None), None)
        prices = [eur(c) for c in cells if eur(c) is not None]
        if label is None or not prices:
            continue
        body.append((label, prices))
    return xs, body


def verify_layout(file, page, body, label_key):
    """Each row's prices must occur as a contiguous run on a layout line that contains the row label key."""
    lines = layout_lines(file, page)
    for label, prices in body:
        key = label_key(label)
        runs = [[int(p.replace(' ', '')) for p in EUR.findall(ln)] for ln in lines if re.search(r'(^|\s|\()' + re.escape(key) + r'(\s|$|\))', ln)]
        ok = any(any(run[i:i + len(prices)] == prices for i in range(len(run) - len(prices) + 1)) for run in runs)
        if not ok:
            raise SystemExit(f'{file} p{page}: row {label!r} {prices} not found in the layout reading')


def grid_table(tid, title, file, page, xs, ys, prices, xname, yname, meta=None):
    t = {'id': tid, 'title': title, 'kind': 'grid2d', 'currency': 'EUR', 'source': {'file': file, 'page': page},
         'x': {'name': xname, 'unit': 'mm', 'values': xs}, 'y': {'name': yname, 'unit': 'mm' if yname == 'projection' else 'pcs', 'values': ys},
         'rounding': 'ceil', 'louvers': None, 'prices': prices}
    if meta:
        t['meta'] = meta
    json.dump(t, open(f'{OUT}/tables/{tid}.json', 'w'), separators=(',', ':'))
    return t


def louvre_count(label):
    m = re.search(r'(\d+) LOUVERS', label.upper())
    return int(m.group(1))


def build_grids():
    out = {}
    # thermal insulation
    for model, file, page in (('s400', S400, 21), ('s500', S500, 46)):
        [rows] = [r for r in tables(file, page) if 'Thermal' in (r[0][0] or '')]
        xs, body = parse_grid(rows, 'num')
        verify_layout(file, page, body, lambda l: l)
        ys = [int(l) for l, _ in body]
        prices = [p + [None] * (len(xs) - len(p)) for _, p in body]  # S500: 8000 row only for single modules
        out[f'{model}.thermal'] = grid_table(f'opt.{model}.thermal', f'Термовставка в ламелях {model.upper()}', file, page, xs, ys, prices, 'width', 'projection')
    # LED strips in louvres
    for model, file, page, prefix in (('s400', S400, 22, 'opt.s400.ledlouvre'), ('s500', S500, 47, 'opt.s500.ledlouvre'), ('s500d', S500, 48, 'opt.s500d.ledlouvre')):
        ts = [r for r in tables(file, page) if any('LOUVER' in (c or '').upper() for row in r for c in row)]
        assert len(ts) == 3, (model, len(ts))
        for colour, rows in zip(LED_COLOURS, ts):
            xs, body = parse_grid(rows, 'range' if model != 's500d' else 'num')
            verify_layout(file, page, body, lambda l: re.search(r'\d+ LOUVERS', l.upper()).group(0))
            ys = [louvre_count(l) for l, _ in body]
            out[f'{model}.ledlouvre.{colour}'] = grid_table(f'{prefix}.{colour}', f'LED-лента в ламелях {colour.upper()} {model.upper()}', file, page, xs, ys, [p for _, p in body], 'width', 'louvres',
                                                           {'louvresLabel': 'total (both halves)' if model == 's500d' else 'per module'})
    # LED in the gutter
    for model, file, page, prefix in (('s400', S400, 23, 'opt.s400.gutter'), ('s500', S500, 49, 'opt.s500.gutter'), ('s500d', S500, 50, 'opt.s500d.gutter')):
        ts = [r for r in tables(file, page) if any('Projection' in (c or '') for row in r for c in row)]
        assert len(ts) == 4, (model, len(ts))
        for typ, rows in zip(GUTTER_TYPES, ts):
            xs, body = parse_grid(rows, 'num')
            verify_layout(file, page, body, lambda l: l)
            ys = [int(l) for l, _ in body]
            out[f'{model}.gutter.{typ}'] = grid_table(f'{prefix}.{typ}', f'LED в желобе {typ} {model.upper()}', file, page, xs, ys, [p for _, p in body], 'width', 'projection')
    # cross-catalogue identity check (S400 vs S500 single, same cells)
    def cell(t, x, y):
        return t['prices'][t['y']['values'].index(y)][t['x']['values'].index(x)] if x in t['x']['values'] and y in t['y']['values'] else None
    checked = 0
    for kind, variants in (('ledlouvre', LED_COLOURS), ('gutter', GUTTER_TYPES)):
        for v in variants:
            a, b = out[f's400.{kind}.{v}'], out[f's500.{kind}.{v}']
            for x in a['x']['values']:
                for y in a['y']['values']:
                    ca, cb = cell(a, x, y), cell(b, x, y)
                    if ca is not None and cb is not None:
                        checked += 1
                        if ca != cb:
                            raise SystemExit(f'{kind}.{v} {x}x{y}: S400 {ca} != S500 {cb} (variant order?)')
    print(f'grids: {len(out)} tables; {checked} shared cells equal in S400 and S500')


SCALARS = {
    # key: (file, page, regex over normalised text, group -> int list, expected count)
    's400.sensors': (S400, 19, r'Price: (\d+) € Price: (\d+) € Price: (\d+) € Price: (\d+) € Price: (\d+) € Price: (\d+) €'),
    's500.sensors': (S500, 44, r'Price: (\d+) € Price: (\d+) € Price: (\d+) € Price: (\d+) € Price: (\d+) € Price: (\d+) €'),
    's400.smart': (S400, 20, r'Price: (\d+) € Price: (\d+) €'),
    's500.smart': (S500, 45, r'Price: (\d+) € Price: (\d+) €'),
    's400.postHeight': (S400, 17, r'Included in price (\d+) € (\d+) €'),
    's500.postHeight': (S500, 42, r'Included in price (\d+) €'),
    's400.intermediatePost': (S400, 17, r'(\d+) € (\d+) € (\d+) € Side drainage'),
    's500.intermediatePost': (S500, 42, r'(\d+) € (\d+) € Included in price'),
    's400.internalBox': (S400, 17, r'(\d+) € / pc\.'),
    's500.internalBox': (S500, 42, r'(\d+) € / 1 pc\. The internal box'),
    's400.sideDrainage': (S400, 18, r'Price per 1 pc\. (\d+) € / 1 pc\.'),
    's500.sideDrainage': (S500, 43, r'Price per 1 pc\. (\d+) € / 1 pc\.'),
    's400.audio': (S400, 26, r'Price: (\d+) €'),
    's500.audio': (S500, 54, r'AUDIO SYSTEM.*?Price: (\d+) €'),
    's500.sockets': (S500, 54, r'Price: (\d+) € Price: (\d+) €'),
    's500.socketConnection': (S500, 54, r'connecting it\. (\d+) €'),
}


# Values the pdfplumber text reading cannot place (characters out of order); checked on the page image.
VERIFIED_BY_IMAGE = {'s500.postHeight': [155]}  # S500 p.42: 'from 2801mm up to 3200mm — 155 €' (image checked 12.10.2026)


def norm(t):
    return re.sub(r'\s+', ' ', t)


def build_scalars():
    out = {}
    for key, (file, page, rx) in SCALARS.items():
        vals = []
        for t in (norm(text_pp(file, page)), norm(' '.join(layout_lines(file, page)))):
            m = re.search(rx, t)
            vals.append([int(v) for v in m.groups()] if m else None)
        if vals[0] != vals[1] or vals[0] is None:
            # reading A (pdfplumber text) may order side-by-side columns differently; accept only if the layout
            # reading is found and every value also appears in reading A
            a = norm(text_pp(file, page))
            if vals[1] is not None and all(re.search(r'(?<!\d)%d ?€' % v, a) for v in vals[1]):
                vals[0] = vals[1]
            elif vals[1] is not None and VERIFIED_BY_IMAGE.get(key) == vals[1]:
                vals[0] = vals[1]
            else:
                raise SystemExit(f'{key} p{page}: readings differ {vals}')
        out[key] = {'values': vals[0], 'source': {'file': file, 'page': page}}
    return out


HEATERS_ORDER = [  # layout reading order on the heater page, mapping checked on the page image (S400 p.25)
    ('m1.single', 'Модель 1, 1500 Вт (~10 м²): 1 обогреватель + 1 блок', 1, 1500, 1),
    ('m1.double', 'Модель 1, 4000 Вт (~25 м²): двойной + 2 блока', 1, 4000, 1),
    ('m1.pair', 'Модель 1, 1500 Вт: 2 обогревателя + 1 блок (вкл. вместе)', 2, 1500, 1),
    ('m2.single', 'Модель 2, 1500 Вт, регулировка мощности: 1 + 1 блок', 1, 1500, 1),
    ('m2.double', 'Модель 2, 4000 Вт, регулировка мощности: двойной + 2 блока', 1, 4000, 1),
    ('m2.pair', 'Модель 2, 1500 Вт: 2 обогревателя + 2 блока', 2, 1500, 1),
    ('m3.single', 'Модель 3, 2000 Вт (~20 м²), керамическое стекло: 1 + 1 блок', 1, 2000, 1),
    ('m3.pair', 'Модель 3, 2000 Вт: 2 обогревателя + 2 блока (раздельные каналы)', 2, 2000, 2),
]


def build_heaters():
    out = {}
    for model, file, page in (('s400', S400, 25), ('s500', S500, 53)):
        lay = [int(p.replace(' ', '')) for p in EUR.findall(' '.join(layout_lines(file, page)))]
        pp = [int(p.replace(' ', '')) for p in EUR.findall(norm(text_pp(file, page)))]
        if sorted(lay) != sorted(pp) or len(lay) != 9:
            raise SystemExit(f'heaters {model}: readings differ {lay} {pp}')
        sets = [{'id': k, 'name': n, 'heaters': h, 'watts': w, 'channels': c, 'price': v,
                 'needsInternalBox': not k.startswith('m1')} for (k, n, h, w, c), v in zip(HEATERS_ORDER, lay[:8])]
        out[model] = {'sets': sets, 'preparation': lay[8], 'source': {'file': file, 'page': page}}
    if [x['price'] for x in out['s400']['sets']] != [x['price'] for x in out['s500']['sets']]:
        raise SystemExit('heater prices differ between S400 and S500')
    return out


if __name__ == '__main__':
    build_grids()
    sc = build_scalars()
    sc['heaters'] = build_heaters()
    print('heaters', [(x['id'], x['price']) for x in sc['heaters']['s400']['sets']], 'prep', sc['heaters']['s400']['preparation'])
    for k, v in sc.items():
        print(k, v.get('values', '...'), 'p', v.get('source', {}).get('page', ''))
    json.dump(sc, open(f'{OUT}/options-scalars.json', 'w'), ensure_ascii=False, indent=1)
