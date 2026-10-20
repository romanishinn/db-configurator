"""Build Win Screen ZIP price tables and WIN CONTROL motors (Win Screen catalogue 07.2026).

Tables (pages are PDF page numbers):
- zip110.adaptive  p.21  ADAPTIVE ZIP SYSTEM 110 (box mounted on the opening, used on pergolas)
- zip130.adaptive  p.24  ADAPTIVE ZIP SYSTEM 130
Prices are EUR net for a screen with Soltis 7635, standard colours, brackets and bottom bar; motor and
control are extra (catalogue "ADDITIONAL SURCHARGES: Motors (p.93-116)").
Every cell is read twice (pdfplumber word positions + pdftotext reading order) and must agree.
Motor torque per cell comes from the staircase lines (see screen_grid.py). Blocks whose zones do not match
the torque labels one to one get the block's highest torque (ASSUMPTION, conservative motor choice).
"""
import json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(__file__))
import pdfplumber
from screen_grid import blocks_from_words, layout_rows, verify_order, torque_zones, torque_labels, collection_limits

SRC = os.environ.get('SW_PDF_DIR', '/mnt/user-data/uploads/Price')
FILE = 'WIN-SCREEN-EN-07.2026-.pdf'
OUT = 'data/catalog/2026-07'
TABLES = {
    'zip110.adaptive': (21, 'Win Screen ZIP 110 — адаптивный короб'),
    'zip130.adaptive': (24, 'Win Screen ZIP 130 — адаптивный короб'),
}
MOTOR_PAGE = 47


def block_torque(page, b):
    z = torque_zones(page, b)
    labs = torque_labels(page, b)
    zones_used = sorted({z[(h, w)] for h, r in b['rows'].items() for w in r['cells']})
    # zone k under label k (left to right) on the last row of every labelled column
    zone_at = []
    for nm, x in labs:
        j = min(range(len(b['x'])), key=lambda k: abs(b['x'][k] - x))
        w = b['cols'][j]
        hs = [h for h, r in b['rows'].items() if w in r['cells']]
        zone_at.append(z[(max(hs), w)] if hs else None)
    clean = zones_used == list(range(len(labs))) and zone_at == list(range(len(labs)))
    out = {}
    for h, r in b['rows'].items():
        for w in r['cells']:
            out[(h, w)] = labs[z[(h, w)]][0] if clean else max(nm for nm, _ in labs)
    return out, clean, [nm for nm, _ in labs]


def build_table(pdf, tid, page_no, title):
    with pdfplumber.open(pdf) as d:
        page = d.pages[page_no - 1]
        blocks = blocks_from_words(page)
        problems = verify_order(blocks, layout_rows(pdf, page_no))
        if problems:
            raise SystemExit(f'{tid} p{page_no}: readings disagree: {problems[:5]}')
        cells, torque, limits, notes = {}, {}, [], []
        for b in blocks:
            for h, r in b['rows'].items():
                for w, v in r['cells'].items():
                    cells[(h, w)] = v
            t, clean, labels = block_torque(page, b)
            torque.update(t)
            if not clean:
                notes.append(f'widths {b["cols"][0]}-{b["cols"][-1]}: torque labels {labels} do not match the drawn zones; '
                             f'ASSUMPTION {max(labels)} Nm for the whole block')
            limits += collection_limits(page, b)
    xs = sorted({w for _, w in cells})
    ys = sorted({h for h, _ in cells})
    prices = [[cells.get((h, w)) for w in xs] for h in ys]
    tq = [[torque.get((h, w)) for w in xs] for h in ys]
    names = {'SOLTIS 7635': 'soltis-7635', 'SOLTIS 86': 'soltis-86', 'SERGE 600': 'serge-600', 'SOLTIS 92': 'soltis-92',
             'SERGE 100': 'serge-100', 'SERGE 600 BO': 'serge-600-bo-lunar'}
    for l in limits:
        l['collections'] = [names[c] for c in l['collections']]
    t = {
        'id': tid, 'title': title, 'kind': 'grid2d', 'currency': 'EUR',
        'source': {'file': FILE, 'page': page_no},
        'x': {'name': 'width', 'unit': 'mm', 'values': xs},
        'y': {'name': 'height', 'unit': 'mm', 'values': ys},
        'rounding': 'ceil', 'louvers': None, 'prices': prices,
        'meta': {'torqueNm': tq, 'collectionLimits': limits, 'notes': notes},
    }
    with open(f'{OUT}/tables/{tid}.json', 'w') as f:
        json.dump(t, f, separators=(',', ':'))
    n = sum(v is not None for row in prices for v in row)
    print(f'{tid}: p{page_no} {len(xs)}x{len(ys)} grid, {n} prices, limits {[(l["type"], l.get("maxHeight") or l.get("maxWidth"), l["collections"]) for l in limits]}')
    for s in notes:
        print('   ', s)


MOTOR = re.compile(r'(?:^|\s)(\d{1,2})(?: \(short\))?\s+(?:17\s+)?(\d{2,3}) ?€.*?\b((?:WS|W|R)Z?M45-\d+/17-EL/D(?:-Z3\.0)?)\b.*?(\d{3})\s+(\d{3})\s*$')


def motor_rows(lines):
    out = []
    for ln in lines:
        m = MOTOR.search(ln)
        if m:
            nm, price, idx, min_a, min_f = m.groups()
            out.append((idx, int(nm), int(price), int(min_a), int(min_f)))
    return out


def build_motors(pdf):
    with pdfplumber.open(pdf) as d:
        a = motor_rows((d.pages[MOTOR_PAGE - 1].extract_text() or '').splitlines())
    lay = subprocess.run(['pdftotext', '-f', str(MOTOR_PAGE), '-l', str(MOTOR_PAGE), '-layout', pdf, '-'], capture_output=True, text=True, check=True).stdout
    b = motor_rows(re.sub(r' {2,}', ' ', ln) for ln in lay.splitlines())
    if a != b or len(a) != 7:
        raise SystemExit(f'motor readings differ or incomplete:\n{a}\n{b}')
    motors = [{'index': idx, 'control': 'radio' if idx.startswith('R') else 'wired', 'nm': nm, 'price': price,
               'minWidth': {'adaptive': ma, 'flush': mf}} for idx, nm, price, ma, mf in a]
    out = {'source': {'file': FILE, 'page': MOTOR_PAGE, 'note': 'WIN CONTROL motors, EUR net, added to the screen price'}, 'motors': motors}
    with open(f'{OUT}/screen-motors.json', 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f'motors: {len(motors)} WIN CONTROL motors, both readings agree')


# ---------- LED lighting in the ZIP guide rails (ZIP 130 only, p.23-24) ----------
GUIDE_PAGE, GUIDE_LIGHT_PAGE = 24, 23
# column x ranges (PDF points) of the "Surcharge for guide rail change" block, p.24, read with both tools
GUIDE_COLS = {'P4': (1147, 1162), 'Z5': (1166, 1181)}


def guide_led(pdf):
    """Surcharge for changing the guide rails of a ZIP 130 screen to a rail with integrated LED (p.24, per height row;
    the price includes the LED strip and the 24 V power supply, p.23), and the WIN CONTROL ON/OFF control unit (p.23)."""
    heights = json.load(open(f'{OUT}/tables/zip130.adaptive.json'))['y']['values']
    out = {}
    with pdfplumber.open(pdf) as d:
        page = d.pages[GUIDE_PAGE - 1]
        for name, (x0, x1) in GUIDE_COLS.items():
            # reading 1: upright characters in the column, grouped by line
            rows = {}
            for c in page.chars:
                if c['upright'] and x0 <= (c['x0'] + c['x1']) / 2 < x1 - 2 and 100 < c['top'] < 700: # by the centre: digits of the banded neighbour columns stay out
                    rows.setdefault(round(c['top']), []).append(c)
            a = [int(''.join(ch['text'] for ch in sorted(r, key=lambda ch: ch['x0']))) for _, r in sorted(rows.items())]
            a = [v for v in a if v >= 100]
            # reading 2: pdftotext of the cropped column (single stray digits of the neighbour columns dropped)
            txt = subprocess.run(['pdftotext', '-f', str(GUIDE_PAGE), '-l', str(GUIDE_PAGE), '-r', '72', '-x', str(x0), '-y', '100', '-W', str(x1 - x0), '-H', '600',
                                  '-layout', pdf, '-'], capture_output=True, text=True, check=True).stdout
            b = [int(t) for t in txt.split() if t.isdigit() and len(t) >= 3]
            if a != b or len(a) != len(heights) or a != sorted(a):
                raise SystemExit(f'guide LED {name}: readings differ or wrong length ({len(a)}/{len(b)}/{len(heights)})\n{a}\n{b}')
            out[name] = a
        light = d.pages[GUIDE_LIGHT_PAGE - 1].extract_text() or ''
    m = re.findall(r'Control unit for WIN CONTROL lighting – ON/OFF \(can be installed inside the box or guide rail\) (\d+) €', light)
    lay = subprocess.run(['pdftotext', '-f', str(GUIDE_LIGHT_PAGE), '-l', str(GUIDE_LIGHT_PAGE), '-layout', pdf, '-'], capture_output=True, text=True, check=True).stdout
    m2 = re.findall(r'Control unit for WIN CONTROL lighting – ON/OFF \(can be installed inside the box or guide rail\)\s+(\d+) €', lay)
    if not m or m != m2:
        raise SystemExit(f'guide LED control unit unclear {m} {m2}')
    t = {'id': 'zip130.adaptive.guideLed', 'title': 'ZIP 130 — направляющие со встроенной LED-подсветкой (доплата за замену)', 'kind': 'list',
         'source': {'file': FILE, 'page': GUIDE_PAGE, 'pages': [GUIDE_LIGHT_PAGE, GUIDE_PAGE]},
         'heights': heights, 'rails': out, 'controlUnit': int(m[0]),
         'meta': {'rails': {'P4': 'WS ZIP P4 — recessed rail for concealed installation with spacer + 1 x LED', 'Z5': 'WS ZIP Z5 — integrated rail + 1 x LED'},
                  'includes': 'LED WHITE IP67 7.5 W strip (3000 K or 4000 K) + 24 V SLIM IP67 power supply (p.23)'}}
    with open(f'{OUT}/tables/zip130.adaptive.guideLed.json', 'w') as f:
        json.dump(t, f, separators=(',', ':'))
    print(f'guide LED: {len(heights)} heights, P4 {out["P4"][0]}–{out["P4"][-1]} €, Z5 {out["Z5"][0]}–{out["Z5"][-1]} €, control unit {t["controlUnit"]} €; both readings agree')


if __name__ == '__main__':
    pdf = os.path.join(SRC, FILE)
    for tid, (pg, title) in TABLES.items():
        build_table(pdf, tid, pg, title)
    build_motors(pdf)
    guide_led(pdf)
    import build_controls  # adds the solar kit to screen-motors.json and writes screen-controls.json
    build_controls.build()
