"""Win Climatic Slide (sliding-roof pergola) price list 07.2026: base prices, options, coating rates.

Base grids (pages 5–9) — two independent readings that must agree:
  A: pdfplumber characters clustered into lines (left half of the page): label, projection range, 4 prices, louvres;
  B: pdftotext -raw: the price rows (4 prices + louvre count) in order, then the labels and the ranges as lists.
The louvre count is the row key. The built projection is the catalogue "projection range" (fixed by the louvre
count); the nominal label (2500, 2750, …, "4400", "4500" …) is kept for reference only.

Option grids (thermal insulation p.11, LED in the gutter p.13): A = pdfplumber lines, B = pdftotext -layout lines;
every row must give the same prices in both. Scalars (posts, lamps, heaters, audio, sockets, Somfy io devices):
labelled sequences that both readings must contain. Coating rates (p.10): both readings, rows matched by label.
"""
import json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(__file__))
import pdfplumber
from grid_chars import lines_of

SRC = os.environ.get('SW_PDF_DIR', '/mnt/user-data/uploads/Price')
FILE = 'WIN-CLIMATIC-SLIDE-EN-07.2026.pdf'
OUT = 'data/catalog/2026-07'
PRICE = r'(\d{1,3}(?: \d{3})?) ?€'
WIDTHS = [2500, 3000, 3500, 4000]
LOUVRES = list(range(10, 30))

BASE = [
    # id, page, title
    ('slide.wall.base', 5, 'Slide — пристенная, базовый модуль (2 стойки)'),
    ('slide.wall.add', 6, 'Slide — пристенная, доп. модуль'),
    ('slide.free.base', 7, 'Slide — отдельностоящая, базовый модуль (4 стойки)'),
    ('slide.free.add', 8, 'Slide — отдельностоящая, доп. модуль'),
    ('slide.roof', 9, 'Slide — кровельный модуль (базовый или доп.)'),
]

# Rows found by one reading only, checked on the page image. Empty: both readings found every row.
VERIFIED_SINGLE = {}
MANUAL = {}


def pdf():
    return os.path.join(SRC, FILE)


def run(*args):
    return subprocess.run(['pdftotext', *args, pdf(), '-'], capture_output=True, text=True, check=True).stdout


def num(s):
    return int(s.replace(' ', ''))


def reading_a(page):
    """pdfplumber: full rows 'label range p p p p louvres' on the left half of the page."""
    rx = re.compile(r'^(\d{4})\s+(\d{4})-(\d{4})\s+' + r'\s+'.join([PRICE] * 4) + r'\s+(\d{1,2})\b')
    with pdfplumber.open(pdf()) as d:
        pg = d.pages[page - 1]
        ls = lines_of(pg.crop((0, 0, pg.width * 0.5, pg.height)))
    rows = {}
    for _, _, s in ls:
        m = rx.match(s.strip())
        if m:
            g = m.groups()
            rows[int(g[7])] = {'label': int(g[0]), 'range': [int(g[1]), int(g[2])], 'prices': [num(p) for p in g[3:7]]}
    return rows


def reading_b(page):
    """pdftotext -raw: price rows in order; labels and ranges as separate runs."""
    t = run('-raw', '-f', str(page), '-l', str(page))
    prow = re.compile(r'^' + r' '.join([PRICE] * 4) + r' (\d{1,2})$')
    rows, labels, ranges = {}, [], []
    for ln in (l.strip() for l in t.splitlines()):
        m = prow.match(ln)
        if m:
            rows[int(m.group(5))] = [num(p) for p in m.groups()[:4]]
        elif re.fullmatch(r'\d{4}-\d{4}', ln):
            ranges.append([int(v) for v in ln.split('-')])
    # labels: the ascending run of 4-digit values starting at 2500 (drawing dimensions are filtered out)
    vals = [int(l.strip()) for l in t.splitlines() if re.fullmatch(r'\d{4}', l.strip())]
    i = vals.index(2500)
    run_ = [vals[i]]
    for v in vals[i + 1:]:
        if v > run_[-1]: run_.append(v)
        else: break
    labels = run_
    return rows, labels, ranges


def is_subsequence(a, b):
    it = iter(b)
    return all(x in it for x in a)


def build_base(tid, page, title):
    a = reading_a(page)
    b, labels_b, ranges_b = reading_b(page)
    conflicts = [k for k in set(a) & set(b) if a[k]['prices'] != b[k]]
    if conflicts:
        raise SystemExit(f'{tid} p{page}: readings differ for louvres {sorted(conflicts)}')
    single = sorted(set(a) ^ set(b))
    unverified = [k for k in single if k not in VERIFIED_SINGLE.get(tid, [])]
    if unverified:
        raise SystemExit(f'{tid} p{page}: rows from one reading only, not verified: {unverified}')
    if sorted(a) != LOUVRES:
        raise SystemExit(f'{tid} p{page}: louvre rows {sorted(a)}')
    rng_a = [a[k]['range'] for k in LOUVRES]
    lab_a = [a[k]['label'] for k in LOUVRES]
    if not is_subsequence(ranges_b, rng_a) or len(ranges_b) < len(LOUVRES) - 1:
        raise SystemExit(f'{tid} p{page}: projection ranges differ {ranges_b} vs {rng_a}')
    if not is_subsequence(labels_b, lab_a) or len(labels_b) < len(LOUVRES) - 1:
        raise SystemExit(f'{tid} p{page}: labels differ {labels_b} vs {lab_a}')
    for i in range(1, len(rng_a)):
        if not (rng_a[i][0] > rng_a[i - 1][1]):
            raise SystemExit(f'{tid}: ranges not ascending at {i}')
    return {
        'id': tid, 'title': title, 'kind': 'grid2d', 'currency': 'EUR', 'priceType': 'catalog_net',
        'source': {'file': FILE, 'page': page},
        'x': {'name': 'width', 'unit': 'mm', 'values': WIDTHS},
        # y = upper end of the projection range of each louvre count (ceil lookup picks the row that can be built)
        'y': {'name': 'projection', 'unit': 'mm', 'values': [r[1] for r in rng_a]},
        'rounding': 'ceil',
        'louvers': LOUVRES,
        'prices': [a[k]['prices'] for k in LOUVRES],
        'meta': {'projectionRanges': rng_a, 'nominalProjection': lab_a,
                 'note': 'Вылет задан числом ламелей: перголу делают только в пределах «projection range» строки.'},
        'manualRows': [],
    }


# ---------- option grids ----------

def plumber_lines(page):
    with pdfplumber.open(pdf()) as d:
        return [s for _, _, s in lines_of(d.pages[page - 1])]


def layout_lines(page):
    return [re.sub(r' {2,}', '  ', l).strip() for l in run('-layout', '-f', str(page), '-l', str(page)).splitlines()]


def grid_rows(lines, n_prices, first_label=2500, last_label=7000):
    """'2500 p p p …' rows with exactly n_prices prices after a 4-digit length label."""
    rx = re.compile(r'(?<!\d)(\d{4})\s+((?:' + PRICE + r'\s*){%d})' % n_prices)
    out = {}
    for s in lines:
        m = rx.search(s)
        if not m:
            continue
        k = int(m.group(1))
        if first_label <= k <= last_label and k % 500 == 0:
            out[k] = [num(p) for p in re.findall(PRICE, m.group(2))]
    return out


def option_grid(tid, title, page, rows, yname):
    ys = sorted(rows)
    t = {'id': tid, 'title': title, 'kind': 'grid2d', 'currency': 'EUR', 'source': {'file': FILE, 'page': page},
         'x': {'name': 'width', 'unit': 'mm', 'values': WIDTHS}, 'y': {'name': yname, 'unit': 'mm', 'values': ys},
         'rounding': 'ceil', 'louvers': None, 'prices': [rows[y] for y in ys]}
    return t


def build_thermal():
    a = grid_rows(plumber_lines(11), 4)
    b = grid_rows(layout_lines(11), 4)
    if a != b or sorted(a) != list(range(2500, 7001, 500)):
        raise SystemExit(f'thermal p11: readings differ\n{a}\n{b}')
    return option_grid('opt.slide.thermal', 'Slide — термоизоляция в ламелях (на модуль)', 11, a, 'projection')


GUTTER = ['bwhite', 'brgbw', 'cwhitergb']  # order printed on p.13: WHITE, RGBW (WHITE + RGB), WHITE + RGB
GUTTER_TITLE = {'bwhite': 'белая', 'brgbw': 'RGBW (белая + RGB)', 'cwhitergb': 'белая + RGB'}


def build_gutter():
    ra, rb = {}, {}
    for lines, out in ((plumber_lines(13), ra), (layout_lines(13), rb)):
        rx = re.compile(r'(?<!\d)(\d{4})\s+((?:' + PRICE + r'\s*){4})')
        for s in lines:
            found = rx.findall(s)
            if len(found) == 3:
                for i, f in enumerate(found):
                    out.setdefault(GUTTER[i], {})[int(f[0])] = [num(p) for p in re.findall(PRICE, f[1])]
    if ra != rb or any(sorted(ra[g]) != list(range(2500, 7001, 500)) for g in GUTTER):
        raise SystemExit(f'gutter p13: readings differ\n{ra}\n{rb}')
    return [option_grid(f'opt.slide.gutter.{g}', f'Slide — LED в водостоке, {GUTTER_TITLE[g]} (на модуль)', 13, ra[g], 'projection')
            for g in GUTTER]


# ---------- scalars ----------

def norm(t):
    return re.sub(r'\s+', ' ', t)


SCALARS = {
    # key: (page, regex over normalised text)
    # p.11: post height surcharge (2601–3000, 3001–3200) and additional dividing post (≤2600, 2601–3000, 3001–3200)
    # one run on the page: 'Included in price 81 € 121 € 765 € 845 € 887 €' (post height ×2, dividing post ×3)
    'slide.posts': (11, r'Included in price (\d+) € (\d+) € (\d+) € (\d+) € (\d+) €'),
    'slide.cornerPostToCentre': (11, r'\+ (\d+) €'),
    'slide.vertical': (13, r'PRICE: ' + ' '.join([PRICE] * 10)),
    'slide.heaters': (14, r'Price per set: Price per set: (\d+) € (\d+) €'),
    'slide.heaterPrep': (14, r'connecting the installations\) (\d+) €'),
    'slide.audio': (15, r'Price: (\d+) €'),
    'slide.sockets': (15, r'ELECTRICAL SOCKET USB SOCKET.*?Price: (\d+) € Price: (\d+) €'),
    'slide.socketConnection': (15, r'connecting it\. (\d+) €'),
    'slide.extraWiring': (14, r'Laying additional wiring.*?(\d+) €'),
}
# Somfy io devices on p.12 sit in two side-by-side columns; matched by product code instead.
SOMFY = {'tahoma': 'SW-S1870594', 'eolisWireFree': 'SW-S1816084', 'eolis': 'SW-S1816092', 'soliris': 'SW-S1870532',
         'situoVar': 'SW-S1870369', 'nina': 'SW-S1805251', 'ninaTimer': 'SW-S1811407'}


def page_texts(page):
    with pdfplumber.open(pdf()) as d:
        a = d.pages[page - 1].extract_text() or ''
    b = run('-layout', '-f', str(page), '-l', str(page))
    return norm(a), norm(b), b


def build_scalars():
    out = {}
    for key, (page, rx) in SCALARS.items():
        a, b, _ = page_texts(page)
        va, vb = re.search(rx, a), re.search(rx, b)
        va = [num(v) for v in va.groups()] if va else None
        vb = [num(v) for v in vb.groups()] if vb else None
        if va is None and vb is None:
            raise SystemExit(f'{key} p{page}: not found')
        if va != vb:
            # one reading orders side-by-side columns differently: accept the found values only if every value
            # also stands as a price in the other reading
            have = va or vb
            other = b if va else a
            if va and vb or not all(re.search(r'(?<!\d)%s ?€' % re.escape(f'{v:,}'.replace(',', ' ') if v >= 1000 else str(v)), other) for v in have):
                raise SystemExit(f'{key} p{page}: readings differ {va} {vb}')
            va = have
        out[key] = {'values': va, 'source': {'file': FILE, 'page': page}}
    # p.12 Somfy io devices: price = first '<n> €' after the product code, in both readings
    a, b, raw = page_texts(12)
    somfy = {}
    for k, code in SOMFY.items():
        vals = []
        for t in (a, b):
            m = re.search(re.escape(code) + r'.*?(\d{3}) €', t)
            vals.append(int(m.group(1)) if m else None)
        if vals[0] != vals[1] or vals[0] is None:
            raise SystemExit(f'somfy {k}: readings differ {vals}')
        somfy[k] = vals[0]
    out['slide.somfy'] = {'values': [somfy[k] for k in SOMFY], 'keys': list(SOMFY), 'source': {'file': FILE, 'page': 12}}
    ps = out.pop('slide.posts')
    out['slide.postHeight'] = {'values': ps['values'][:2], 'source': ps['source']}
    out['slide.intermediatePost'] = {'values': ps['values'][2:], 'source': ps['source']}
    # heaters as sets in the shape the options engine uses
    h = out.pop('slide.heaters')['values']
    prep = out.pop('slide.heaterPrep')['values'][0]
    out['heaters.slide'] = {'sets': [
        {'id': 's5.single', 'name': 'Модель 5 (Somfy io), 1500 Вт (~10 м²): 1 обогреватель + 1 блок', 'heaters': 1, 'watts': 1500, 'channels': 1, 'price': h[0], 'needsInternalBox': False},
        {'id': 's5.double', 'name': 'Модель 5 (Somfy io), 4000 Вт (~25 м²): двойной + 2 блока', 'heaters': 1, 'watts': 4000, 'channels': 1, 'price': h[1], 'needsInternalBox': False},
    ], 'preparation': prep, 'source': {'file': FILE, 'page': 14}}
    v = out.pop('slide.vertical')['values']
    a13, b13, _ = page_texts(13)
    add = re.search(r'2 701 € (\d{3}) €', a13) or re.search(r'2 701 € (\d{3}) €', b13)
    if not add:
        raise SystemExit('vertical lamp: additional lamp price not found')
    out['lighting.slide'] = {'vertical': {'counts': list(range(2, 11)), 'prices': v[:9] if len(v) > 9 else v, 'additional': int(add.group(1))},
                             'source': {'file': FILE, 'page': 13}}
    return out


# ---------- coating ----------

COATING_ROWS = [  # (group, label regex on p.10)
    ('fine', r'NON-STANDARD COLOR RANGE – FINE STRUCTURES'),
    ('smooth', r'NON-STANDARD COLOR RANGE – SMOOTH MATT'),
    ('ralAny', r'ANY RAL COLOR \(MATT'),
    ('ralMetallic', r'ANY METALLIC RAL COLOR \(MANUFACTURER'),
    ('structural', r'ANY STRUCTURAL \(NON-METALLIC\) COLOR \(MANUFACTURER'),
    ('structuralRal', r'ANY STRUCTURAL COLOR OR ANY RAL COLOR \(POWDER'),
    ('exclusive', r'EXCLUSIVE FINE METALLIC STRUCTURES / EXCLUSIVE SMOOTH METALLIC'),
    ('wood', r'WOOD-LIKE COLOR RANGE'),
]


def build_coating():
    readings = []
    for t in (plumber_lines(10), layout_lines(10)):
        r = {'standard': [0, 0, 0]}
        for g, rx in COATING_ROWS:
            ln = next((s for s in t if re.search(rx, s) and '%' in s), None)
            if not ln:
                raise SystemExit(f'coating p10: row {g} not found')
            r[g] = [int(v) for v in re.findall(r'\+(\d+)%', ln)]
            if len(r[g]) != 3:
                raise SystemExit(f'coating p10: row {g}: {ln}')
        readings.append(r)
    if readings[0] != readings[1]:
        raise SystemExit(f'coating p10: readings differ {readings}')
    std = [s for s in plumber_lines(10) if 'FASTER LEAD TIME STANDARD COLOR' in s]
    if not std or std[0].count('INCLUDED IN THE PRICE') != 3:
        raise SystemExit('coating p10: standard colours row not "included" three times')
    return readings[0]


def write_json(path, data, compact=False):
    with open(path, 'w', encoding='utf-8') as f:
        if compact: json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        else: json.dump(data, f, ensure_ascii=False, indent=1)


def merge_scalars(sc):
    """Slide keys go into options-scalars.json next to the S400/S500 ones (build_options.py keeps them too)."""
    path = f'{OUT}/options-scalars.json'
    cur = json.load(open(path))
    for k, v in sc.items():
        if k.startswith('heaters.'):
            cur.setdefault('heaters', {})[k.split('.', 1)[1]] = v
        elif k.startswith('lighting.'):
            cur.setdefault('lighting', {})[k.split('.', 1)[1]] = v
        else:
            cur[k] = v
    write_json(path, cur)


if __name__ == '__main__':
    os.makedirs(f'{OUT}/tables', exist_ok=True)
    for tid, page, title in BASE:
        t = build_base(tid, page, title)
        write_json(f'{OUT}/tables/{tid}.json', t)
        print(f'{tid}: {len(t["prices"])}×{len(WIDTHS)}  {t["prices"][0][0]} … {t["prices"][-1][-1]}')
    for t in [build_thermal(), *build_gutter()]:
        write_json(f'{OUT}/tables/{t["id"]}.json', t, compact=True)
        print(f'{t["id"]}: {t["prices"][0]} … {t["prices"][-1]}')
    sc = build_scalars()
    merge_scalars(sc)
    for k, v in sc.items():
        print(k, v.get('values') or v.get('vertical') or [s['price'] for s in v.get('sets', [])])
    rates = build_coating()
    coating = json.load(open(f'{OUT}/coating.json'))
    coating['rates']['SLIDE'] = rates
    with open(f'{OUT}/coating.json', 'w', encoding='utf-8') as f:
        json.dump(coating, f, ensure_ascii=False, indent=2); f.write('\n')
    print('coating SLIDE', rates)
