"""Win Screen price grids (two blocks per page: widths up to 4000/5000 and a narrower high block).

Two independent readings, cross-checked cell by cell:
- words:  pdfplumber words with PDF coordinates (pdfminer engine)
- layout: pdftotext -layout character columns (poppler engine)
Torque zones (6/8/10/15 Nm) are the thick black staircase polylines drawn over the grid:
a cell's zone index = number of staircase vertical segments to its left in that row.
Red polylines mark "maximum height for the collection ..." limits.
"""
import re, subprocess
import pdfplumber

NUM = re.compile(r'^\d{3,5}$')


def _runs(items, step=100):
    """items: [(value, x)] sorted by x -> runs of values ascending by `step` (len >= 5).
    A run also breaks at a large horizontal gap (second block on the facing page)."""
    runs, cur = [], []
    for v, x in items:
        gap_ok = not cur or len(cur) < 2 or (x - cur[-1][1]) < 2.5 * (cur[-1][1] - cur[-2][1])
        if cur and v == cur[-1][0] + step and gap_ok:
            cur.append((v, x))
        else:
            if len(cur) >= 5:
                runs.append(cur)
            cur = [(v, x)]
    if len(cur) >= 5:
        runs.append(cur)
    return runs


def _split_merged(tokens):
    """'230024002500' (digits printed without spacing) -> three 4-digit tokens with interpolated x."""
    out = []
    for v, x0, x1 in tokens:
        t = str(v)
        if len(t) > 4 and len(t) % 4 == 0:
            n = len(t) // 4
            w = (x1 - x0) / n
            out += [(int(t[i * 4:i * 4 + 4]), x0 + w * (i + 0.5)) for i in range(n)]
        else:
            out.append((v, (x0 + x1) / 2))
    return out


def _lines(words, tol=2.0):
    rows = []
    for w in sorted(words, key=lambda w: ((w['top'] + w['bottom']) / 2, w['x0'])):
        yc = (w['top'] + w['bottom']) / 2
        if rows and abs(rows[-1][0] - yc) <= tol:
            rows[-1][1].append(w)
        else:
            rows.append([yc, [w]])
    return [(y, sorted(ws, key=lambda w: w['x0'])) for y, ws in rows]


def blocks_from_words(page):
    """Find grid blocks: header runs of widths, then row labels and cells. Returns list of blocks."""
    words = page.extract_words(x_tolerance=1)
    lines = _lines(words)
    blocks = []
    for y, ws in lines:
        items = [(v, x) for v, x in _split_merged([(int(w['text']), w['x0'], w['x1']) for w in ws if w['text'].isdigit()]) if 1000 <= v <= 7000]
        for run in _runs(items):
            # a header is followed by row labels in the same column left of the first width
            blocks.append({'y': y, 'cols': [v for v, _ in run], 'x': [x for _, x in run]})
    out = []
    for b in blocks:
        step = min(b2 - b1 for b1, b2 in zip(b['x'], b['x'][1:]))
        left = b['x'][0]
        rows = {}
        for y, ws in lines:
            if y <= b['y'] + 2:
                continue
            labels = [w for w in ws if NUM.match(w['text']) and left - 1.6 * step < (w['x0'] + w['x1']) / 2 < left - 0.5 * step]
            if not labels:
                continue
            h = int(labels[0]['text'])
            if h % 100 or not 500 <= h <= 7000:
                continue
            cells = {}
            for k, w in enumerate(ws):
                if not NUM.match(w['text']) or w is labels[0]:
                    continue
                if k and ws[k - 1]['text'].isalpha() and w['x0'] - ws[k - 1]['x1'] < 8:
                    continue  # part of a label, e.g. 'SERGE 100'
                xc = (w['x0'] + w['x1']) / 2
                j = min(range(len(b['x'])), key=lambda k: abs(b['x'][k] - xc))
                if abs(b['x'][j] - xc) <= 0.45 * step and b['cols'][j] not in cells:
                    cells[b['cols'][j]] = int(w['text'])
            if h in rows:
                break  # next table below on the same page
            rows[h] = {'y': y, 'cells': cells}
        heights = sorted(rows)
        # keep the contiguous run of heights (stop at a gap: bracket/width rows below the grid)
        keep = [heights[0]] if heights else []
        for h in heights[1:]:
            if h == keep[-1] + 100:
                keep.append(h)
            else:
                break
        out.append({'cols': b['cols'], 'x': b['x'], 'step': step, 'y': b['y'], 'rows': {h: rows[h] for h in keep}})
    # drop "Width / Number of brackets" helper rows misread as headers: they have no data rows
    return [b for b in out if len(b['rows']) >= 5]


def layout_rows(pdf, page_no):
    """pdftotext -layout: {height: [numbers after the label, in reading order]} for every line starting with a height."""
    txt = subprocess.run(['pdftotext', '-f', str(page_no), '-l', str(page_no), '-layout', pdf, '-'],
                         capture_output=True, text=True, check=True).stdout.splitlines()
    out = {}
    for ln in txt:
        toks = [int(m.group()) for m in re.finditer(r'(?<!\d)\d{3,5}(?!\d)', ln)]
        if len(toks) >= 3 and toks[1] == toks[0] + 100 and toks[2] == toks[0] + 200:
            continue  # width header
        if len(toks) >= 3 and toks[0] % 100 == 0 and 1000 <= toks[0] <= 7000:
            out.setdefault(toks[0], toks[1:])
    return out


def verify_order(blocks, rows_txt):
    """Second reading: per height, the layout numbers must equal block 1 cells (in column order), the height label
    again, then block 2 cells. Each block row must be a contiguous run of columns (ragged only at the ends)."""
    problems = []
    heights = sorted(set().union(*[b['rows'].keys() for b in blocks]))
    for h in heights:
        expect = []
        for k, b in enumerate(blocks):
            r = b['rows'].get(h)
            if not r or not r['cells']:
                continue
            idx = [b['cols'].index(w) for w in r['cells']]
            if sorted(idx) != list(range(min(idx), max(idx) + 1)):
                problems.append((h, 'gap', k))
            if k > 0 and expect:
                expect.append(h)
            expect += [r['cells'][w] for w in sorted(r['cells'])]
        got = rows_txt.get(h)
        if got is None or got[:len(expect)] != expect:
            problems.append((h, 'order', expect[:6], (got or [])[:6]))
    return problems


def _segments(page, black=True):
    """Vertical segments of thick polylines. black=True: torque staircases; False: red max-height lines."""
    segs, horiz = [], []
    for c in page.curves + page.lines:
        lw = c.get('linewidth') or 0
        col = c.get('stroking_color')
        if lw < 0.5 or not isinstance(col, (list, tuple)):
            continue
        is_black = len(col) == 4 and col[3] > 0.9 and max(col[:3]) < 0.1
        is_red = len(col) == 4 and col[1] > 0.8 and col[2] > 0.8 and col[0] < 0.2 and col[3] < 0.2
        if (black and not is_black) or (not black and not is_red):
            continue
        pts = c.get('pts') or [(c['x0'], c['top']), (c['x1'], c['bottom'])]
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            if abs(x1 - x2) < 0.6 and abs(y1 - y2) > 2:
                segs.append((x1, min(y1, y2), max(y1, y2)))
            elif abs(y1 - y2) < 0.6 and abs(x1 - x2) > 2:
                horiz.append((y1, min(x1, x2), max(x1, x2)))
    return segs, horiz


def torque_zones(page, block):
    """Zone index per cell (0 = lowest torque) from the staircase polylines inside the block."""
    segs, _ = _segments(page, True)
    x0 = block['x'][0] - block['step'] / 2
    x1 = block['x'][-1] + block['step'] / 2
    ys = [r['y'] for r in block['rows'].values()]
    y0, y1 = min(ys) - 10, max(ys) + 10
    inside = [s for s in segs if x0 - 1 < s[0] < x1 + 1 and s[2] > y0 and s[1] < y1]
    zones = {}
    for h, r in block['rows'].items():
        for j, w in enumerate(block['cols']):
            xc = block['x'][j]
            zones[(h, w)] = sum(1 for (sx, sa, sb) in inside if sx < xc and sa <= r['y'] <= sb)
    return zones


def torque_labels(page, block):
    """'6 Nm', '8 Nm' ... under the block, ordered left to right: [(nm, x_center)]."""
    words = page.extract_words()
    lines = _lines(words)
    ylast = max(r['y'] for r in block['rows'].values())
    x0 = block['x'][0] - block['step']
    x1 = block['x'][-1] + block['step']
    for y, ws in lines:
        if not (ylast + 3 < y < ylast + 40):
            continue
        toks = [w for w in ws if x0 < w['x0'] < x1]
        out = []
        for a, b in zip(toks, toks[1:]):
            if re.fullmatch(r'\d{1,2}', a['text']) and b['text'] == 'Nm':
                out.append((int(a['text']), (a['x0'] + b['x1']) / 2))
        if out:
            return out
    return []


NAMES = re.compile(r'(SERGE 600 BO|SERGE 100|SERGE 600|SOLTIS 86|SOLTIS 92|SOLTIS 7635)')


def _color_kind(col):
    if not isinstance(col, (list, tuple)) or len(col) != 4:
        return None
    c, m, y, k = col
    if c < 0.2 and m > 0.8 and y > 0.8 and k < 0.2:
        return 'red'
    if c < 0.2 and 0.2 < m < 0.5 and y > 0.8 and k < 0.2:
        return 'orange'
    return None


def collection_limits(page, block):
    """Red polyline: first horizontal segment = maximum height for the named collections over the widths it spans.
    Orange polyline: first vertical segment = maximum width for the named collections (columns left of it).
    The collection names come from the 'Maximum ... for the collection: ...' label at the end of the polyline."""
    words = page.extract_words(x_tolerance=1.5)
    labels = []
    for w in words:
        if w['text'].lower().startswith('collection'):
            line = [x for x in words if abs(x['top'] - w['top']) < 14 and w['x0'] - 140 < x['x0'] < w['x0'] + 260]
            text = ' '.join(x['text'] for x in sorted(line, key=lambda x: (round(x['top']), x['x0'])))
            labels.append(((w['x0'], w['top']), NAMES.findall(text.upper()), 'height' if 'height' in text.lower() else 'width'))
    rows = sorted(block['rows'].items())
    xs = block['x']
    out = []
    for c in page.curves + page.lines:
        kind = _color_kind(c.get('stroking_color'))
        if not kind or (c.get('linewidth') or 0) < 0.5:
            continue
        pts = c.get('pts') or [(c['x0'], c['top']), (c['x1'], c['bottom'])]
        if len(pts) < 2 or max(abs(a[0] - b[0]) + abs(a[1] - b[1]) for a, b in zip(pts, pts[1:])) < 20:
            continue  # arrow heads
        end = pts[-1]
        want = 'height' if kind == 'red' else 'width'
        cand = [l for l in labels if l[2] == want] or labels
        lab = min(cand, key=lambda l: abs(l[0][0] - end[0]) + abs(l[0][1] - end[1]))
        segs = list(zip(pts, pts[1:]))
        if kind == 'red':
            (xa, y), (xb, _) = next(sg for sg in segs if abs(sg[0][1] - sg[1][1]) < 0.6)
            xa, xb = min(xa, xb), max(xa, xb)
            cols = [w for w, x in zip(block['cols'], xs) if xa - 2 <= x <= xb + 2]
            above = [h for h, r in rows if r['y'] < y]
            if len(cols) < 2 or not above or len(above) == len(rows):
                continue
            out.append({'type': 'maxHeight', 'maxHeight': above[-1], 'widths': cols, 'collections': lab[1]})
        else:
            (x, ya), _ = next(sg for sg in segs if abs(sg[0][0] - sg[1][0]) < 0.6)
            if not (xs[0] < x < xs[-1]):
                continue
            left = [w for w, xx in zip(block['cols'], xs) if xx < x]
            out.append({'type': 'maxWidth', 'maxWidth': left[-1], 'collections': lab[1]})
    return out


def torque_nm(page, block):
    """Nm per cell. Labels under the grid name the zones they sit under (last row having a cell in that column).
    Zones without a label: ASSUMPTION — the next higher labelled zone (conservative motor choice)."""
    z = torque_zones(page, block)
    labs = torque_labels(page, block)
    zone_nm = {}
    for nm, x in labs:
        j = min(range(len(block['x'])), key=lambda k: abs(block['x'][k] - x))
        w = block['cols'][j]
        hs = [h for h, r in block['rows'].items() if w in r['cells']]
        if hs:
            zone_nm.setdefault(z[(max(hs), w)], nm)
    out, assumed = {}, set()
    for (h, w), k in z.items():
        if w not in block['rows'][h]['cells']:
            continue
        if k in zone_nm:
            out[(h, w)] = zone_nm[k]
        else:
            higher = [zone_nm[q] for q in sorted(zone_nm) if q > k]
            out[(h, w)] = higher[0] if higher else max(zone_nm.values())
            assumed.add((h, w))
    return out, assumed, zone_nm
