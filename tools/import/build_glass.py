"""Build Win Glass sliding-system price tables (07.2026).

Reference reading: table ruling lines (pdfplumber). Every cell is confirmed by a second independent
reading (char positions or text order); the 43 cells of row 1500 on pp.23–24 were checked against page images.
Tables are ragged: empty cell = this size is not produced (null).
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from grid_pos import verify_glass_page

SRC = os.environ.get('SW_PDF_DIR', '/mnt/user-data/uploads/Price')
FILE = 'WIN-GLASS-NEW-2025-EN-07.2026.pdf'
OUT = 'data/catalog/2026-07/tables'
VERIFIED_BY_IMAGE = {(23, 1500), (24, 1500)}  # (page, height) rows read only by the ruling-lines parser

# (thickness mm, tracks, opening, panels): pages (continuation pages extend the width range)
VARIANTS = {}
for base, t in ((15, 8), (25, 10)):
    VARIANTS[(t, 4, 'single', 3)] = [base]
    VARIANTS[(t, 4, 'single', 4)] = [base + 1]
    VARIANTS[(t, 6, 'single', 5)] = [base + 2]
    VARIANTS[(t, 6, 'single', 6)] = [base + 3]
    VARIANTS[(t, 4, 'double', 6)] = [base + 4]
    VARIANTS[(t, 4, 'double', 8)] = [base + 5]
    VARIANTS[(t, 6, 'double', 10)] = [base + 6, base + 7]
    VARIANTS[(t, 6, 'double', 12)] = [base + 8, base + 9]

def build():
    os.makedirs(OUT, exist_ok=True)
    report = []
    for (thick, tracks, opening, panels), pages in VARIANTS.items():
        cells, cols, glass_w, park_w = {}, [], {}, {}
        for pg in pages:
            a, conflicts, text_conf, unconfirmed = verify_glass_page(f'{SRC}/{FILE}', pg)
            if conflicts or text_conf:
                raise SystemExit(f'p{pg}: conflicts {conflicts} text {text_conf}')
            bad = [c for c in unconfirmed if (pg, c[0]) not in VERIFIED_BY_IMAGE]
            if bad:
                raise SystemExit(f'p{pg}: unconfirmed cells {bad}')
            cells.update(a['cells']); cols += [c for c in a['columns'] if c not in cols]
            glass_w.update(a['extra'].get('glassWidth', {})); park_w.update(a['extra'].get('parkingWidth', {}))
        heights = sorted({h for h, _ in cells})
        tid = f'glass.{thick}mm.{tracks}t.{opening}.{panels}p'
        table = {
            'id': tid, 'title': f'Win Glass {thick} мм, {tracks} направляющих, открывание {"в одну сторону" if opening == "single" else "в обе стороны"}, {panels} полотен',
            'kind': 'grid2d', 'currency': 'EUR', 'priceType': 'catalog_net',
            'source': {'file': FILE, 'page': pages[0], 'pages': pages},
            'x': {'name': 'width', 'unit': 'mm', 'values': cols},
            'y': {'name': 'height', 'unit': 'mm', 'values': heights},
            'rounding': 'ceil', 'louvers': None,
            'prices': [[cells.get((h, w)) for w in cols] for h in heights],
            'meta': {'thickness': thick, 'tracks': tracks, 'opening': opening, 'panels': panels,
                     'glassWidth': [glass_w.get(w) for w in cols], 'parkingWidth': [park_w.get(w) for w in cols]},
        }
        with open(f'{OUT}/{tid}.json', 'w', encoding='utf-8') as f:
            json.dump(table, f, ensure_ascii=False, indent=1)
        n = sum(v is not None for r in table['prices'] for v in r)
        # monotonic check over existing cells
        issues = 0
        for i, r in enumerate(table['prices']):
            vals = [v for v in r if v is not None]
            issues += sum(1 for x, y in zip(vals, vals[1:]) if y < x)
        report.append((tid, n, issues))
    for tid, n, iss in report:
        print(f'{tid}: {n} cells, monotonic issues {iss}')
    print('total', sum(n for _, n, _ in report))

GLAZING = ['float', 'diamant', 'milk', 'brown', 'graphite', 'black', 'mirror']


def glazing():
    """Glazing surcharges per m² (p.9): two readings (pdfplumber text, pdftotext -layout) must agree; checked on the page image."""
    import re, subprocess, pdfplumber
    with pdfplumber.open(f'{SRC}/{FILE}') as d:
        a = (d.pages[8].extract_text() or '').splitlines()
    b = subprocess.run(['pdftotext', '-f', '9', '-l', '9', '-layout', f'{SRC}/{FILE}', '-'], capture_output=True, text=True, check=True).stdout.splitlines()
    res = []
    for lines in (a, b):
        rows = []
        for ln in lines:
            if 'INCLUDED IN PRICE' in ln:  # surcharge rows: 8 mm, then 10 mm
                tail = ln.split('INCLUDED IN PRICE', 1)[1]
                vals = [0] + [None if t == 'OUT OF STOCK' else int(t) for t in re.findall(r'OUT OF STOCK|(?<!\d)\d+(?= ?€)', tail)]
                rows.append(vals)
        res.append(rows)
    if res[0] != res[1] or len(res[0]) != 2 or any(len(r) != len(GLAZING) for r in res[0]):
        raise SystemExit(f'glazing readings differ or incomplete: {res}')
    s8, s10 = res[0]
    out = {'source': {'file': FILE, 'page': 9}, 'unit': 'EUR/m2',
           'types': [{'id': g, 'surcharge': {'8': s8[i], '10': s10[i]}} for i, g in enumerate(GLAZING)]}
    with open('data/catalog/2026-07/glass-glazing.json', 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print('glazing 8 mm', s8, '10 mm', s10)


if __name__ == '__main__':
    if '--glazing' not in sys.argv:
        build()
    glazing()
