"""Win Verto and Win Panels price tables (07.2026).

Win Verto (p.6): price of a package of N vertical profiles (package width = 90·N − 55 mm, profiles 35 mm,
spacing 55 mm) by profile height, plus the price of each additional profile; corner connection 53 €.
Win Panels (p.6 standard colours, p.7 wood-like colours): price of one panel (frame + slats) by width × height,
fixed or rotating trapezoid slats; sliding system (head + bottom rail) by width and number of tracks;
cart stoppers 21 €/pc, frame connector for fixed panels 26 €/pc (3 recommended per joint).
Two readings for every row (pdfplumber text and pdftotext -layout, numbers in reading order), must agree.
"""
import json, os, re, subprocess
import pdfplumber

SRC = os.environ.get('SW_PDF_DIR', '/mnt/user-data/uploads/Price')
VERTO, PANELS = 'WIN-VERTO-EN-07.2026.pdf', 'WIN-PANELS-EN-07.2026.pdf'
OUT = 'data/catalog/2026-07/tables'
EUR = re.compile(r'(?<!\d)(\d(?: \d{3})|\d{2,3}) ?€')


def readings(file, page):
    with pdfplumber.open(os.path.join(SRC, file)) as d:
        a = (d.pages[page - 1].extract_text() or '').splitlines()
    b = subprocess.run(['pdftotext', '-f', str(page), '-l', str(page), '-layout', os.path.join(SRC, file), '-'], capture_output=True, text=True, check=True).stdout.splitlines()
    return a, [re.sub(r' {2,}', ' ', ln).strip() for ln in b]


def table(tid, title, file, page, x, y, prices, meta=None, xname='width'):
    return {'id': tid, 'title': title, 'kind': 'grid2d', 'currency': 'EUR', 'source': {'file': file, 'page': page},
            'x': {'name': xname, 'unit': 'mm' if xname == 'width' else 'pcs', 'values': x}, 'y': {'name': 'height', 'unit': 'mm', 'values': y},
            'rounding': 'ceil', 'louvers': None, 'prices': prices, **({'meta': meta} if meta else {})}


def verto():
    out = []
    for lines in readings(VERTO, 6):
        nums = lambda ln: [int(t) for t in ln.split() if t.isdigit()]
        widths = next(nums(l) for l in lines if l.startswith('395 485'))
        counts = next(nums(l) for l in lines if l.startswith('5 6 7 8'))
        rows = {n[0]: n[1:] for n in (nums(l) for l in lines) if n and n[0] in (1950, 2350, 2950, 3150, 3350, 3950) and len(n) == len(counts) + 2}
        out.append((widths, counts, rows))
    if out[0] != out[1]:
        raise SystemExit('verto readings differ')
    widths, counts, rows = out[0]
    assert len(widths) == len(counts) == 36 and all(w == 90 * n - 55 for w, n in zip(widths, counts)) and len(rows) == 6
    ys = sorted(rows)
    t = table('verto.profiles', 'Win Verto — пакет вертикальных профилей', VERTO, 6, counts, ys, [rows[h][:-1] for h in ys],
              {'packageWidth': widths, 'additionalProfile': [rows[h][-1] for h in ys], 'spacing': 55, 'profileWidth': 35,
               'cornerConnection': corner_price()}, xname='profiles')
    json.dump(t, open(f'{OUT}/verto.profiles.json', 'w'), separators=(',', ':'))
    print(f'verto: {len(counts)} package sizes × {len(ys)} heights, additional profile {t["meta"]["additionalProfile"]}, corner {t["meta"]["cornerConnection"]} €')


def corner_price():
    vals = []
    for lines in readings(VERTO, 6):
        txt = ' '.join(lines)
        m = re.search(r'CORNER CONNECTION OF PROFILES \(1 CORNER – 2 PROFILES\)\s*(\d+) ?€', txt) or re.search(r'OF PROFILES \(1 CORNER – 2 PROFILES\)\s*(\d+) ?€', txt)
        vals.append(int(m.group(1)) if m else None)
    if vals[0] != vals[1] or vals[0] is None:
        # the price sits next to the label box; fall back to the only '€' amount on the page in both readings
        alt = [re.findall(r'(\d+) ?€', ' '.join(l)) for l in readings(VERTO, 6)]
        if alt[0] == alt[1] and len(alt[0]) == 1:
            return int(alt[0][0])
        raise SystemExit(f'verto corner price unclear {vals} {alt}')
    return vals[0]


def panel_grid_words(page):
    with pdfplumber.open(os.path.join(SRC, PANELS)) as d:
        p = d.pages[page - 1]
        words = p.extract_words(x_tolerance=1.5)
        mid = p.width / 2
    rows = {}
    for w in words:
        if w['text'] in ('1400', '1600', '1800', '2000', '2200', '2400', '2600', '2800', '3000'):
            y = (w['top'] + w['bottom']) / 2
            line = sorted([x for x in words if abs((x['top'] + x['bottom']) / 2 - y) < 2.5 and x['x0'] > w['x1']], key=lambda x: x['x0'])
            side = 0 if w['x0'] < mid else 1
            # stop at the next row label of the other table
            seq = []
            for x in line:
                if x['text'] in ('1400', '1600', '1800', '2000', '2200', '2400', '2600', '2800', '3000'):
                    break
                seq.append(x['text'])
            prices = eur_list(' '.join(seq))
            if len(prices) == 8:
                rows.setdefault(int(w['text']), [None, None])[side] = prices
    return {h: v[0] + v[1] for h, v in rows.items() if v[0] and v[1]}


def eur_list(ln):
    return [int(p.replace(' ', '')) for p in EUR.findall(ln)]


def panels():
    for page, colour in ((6, 'std'), (7, 'wood')):
        res = []
        for ri, lines in enumerate(readings(PANELS, page)):
            grid = {}
            if ri == 0:
                grid = panel_grid_words(page)  # reading A: word positions (left table = left half of the page)
            for ln in (lines if ri == 1 else []):
                m = re.match(r'^(1400|1600|1800|2000|2200|2400|2600|2800|3000)\b', ln)
                p = eur_list(ln)
                if m and len(p) == 16:
                    grid[int(m.group(1))] = p
            # rail rows in reading order after the table title (labels are printed apart in one of the readings);
            # the layout reading also carries the labels: they must come in the catalogue order below
            i = next(k for k, ln in enumerate(lines) if 'Sliding system (Head rail' in ln)
            rows7 = [eur_list(ln) for ln in lines[i:] if len(eur_list(ln)) == 7][:6]
            labels = re.findall(r'(\d) TRACKS? -(?:\s*(SLIM|STANDARD))?', ' '.join(lines[i:]))
            rails = {'rows': rows7, 'labels': [(int(n), v or 'STANDARD') for n, v in labels]}
            acc = {k: int(m.group(1)) for k, rx in (('stopper', r'Carts stoppers\s*(\d+) ?€'), ('frameConnector', r'Frame connector\*?\s*(\d+) ?€')) for m in [re.search(rx, ' '.join(lines))] if m}
            res.append((grid, rails, acc))
        order = [(1, 'STANDARD'), (1, 'SLIM'), (2, 'STANDARD'), (2, 'SLIM'), (3, 'STANDARD'), (3, 'SLIM')]
        lay_labels = res[1][1]['labels']
        if lay_labels != order:
            raise SystemExit(f'panels p{page}: rail labels in the layout reading {lay_labels} are not in the expected order')
        res = [(g, r['rows'], a) for g, r, a in res]
        if res[0] != res[1]:
            raise SystemExit(f'panels p{page} readings differ:\n{res[0]}\n{res[1]}')
        grid, rails, acc = res[0]
        assert len(grid) == 9 and len(rails) == 6 and len(acc) == 2, (len(grid), rails, acc)
        ws, hs = [700, 800, 900, 1000, 1100, 1200, 1500, 1800], sorted(grid)
        for k, slats in ((0, 'fixed'), (8, 'rotating')):
            t = table(f'panels.{slats}.{colour}', f'Win Panels — {"неподвижные" if slats == "fixed" else "поворотные"} ламели, {"стандартные цвета" if colour == "std" else "под дерево"}',
                      PANELS, page, ws, hs, [grid[h][k:k + 8] for h in hs], {'slats': slats, 'colour': colour, **acc})
            json.dump(t, open(f'{OUT}/panels.{slats}.{colour}.json', 'w'), separators=(',', ':'))
        t = table(f'panels.rail.{colour}', f'Win Panels — раздвижная система (верхняя + нижняя направляющая), {"стандартные цвета" if colour == "std" else "под дерево"}',
                  PANELS, page, [1000, 2000, 3000, 4000, 5000, 6000, 7000], [1, 2, 3, 4, 5, 6], rails,
                  {'rows': [{'tracks': n, 'slim': v == 'SLIM'} for n, v in order]})
        t['y'] = {'name': 'variant', 'unit': 'pcs', 'values': [1, 2, 3, 4, 5, 6]}
        json.dump(t, open(f'{OUT}/panels.rail.{colour}.json', 'w'), separators=(',', ':'))
        print(f'panels p{page} {colour}: 2×{len(hs)}×8 panels, 6 rail variants, accessories {acc}; e.g. 700×1400 {grid[1400][0]} / {grid[1400][8]} €, rail 1 std 1000 {rails[0][0]} €')


if __name__ == '__main__':
    verto()
    panels()
