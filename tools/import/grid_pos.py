"""Position-based grid parsers for ragged price tables (Win Glass: high glass only for narrow openings).

Every price is assigned to the width column whose header sits closest horizontally, so rows with
fewer prices (a "staircase" table) and side tables to the right are handled correctly.
Two independent readings: pdftotext -layout (character columns) and pdfplumber chars (PDF points).
Result: {'columns': [w...], 'cells': {(height, width): price}}.
"""
import re, subprocess, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import header_widths
import pdfplumber
from grid_chars import lines_of

PRICE = re.compile(r'(\d{1,3}(?: \d{3})*) ?€')
ROWKEY = re.compile(r'^\s*(\d{4})\s+(?=\d{1,3}(?: \d{3})* ?€)')


def _assign(header_pos, price_pos, tol):
    """header_pos: [(width, x)], price_pos: [(price, x)] -> {width: price} for prices within tol of a column."""
    out = {}
    for price, x in price_pos:
        w, hx = min(header_pos, key=lambda h: abs(h[1] - x))
        if abs(hx - x) <= tol and w not in out:
            out[w] = price
    return out


def parse_text(pdf, page):
    txt = subprocess.run(['pdftotext', '-f', str(page), '-l', str(page), '-layout', pdf, '-'],
                         capture_output=True, text=True, check=True).stdout.splitlines()
    first = next((i for i, ln in enumerate(txt) if ROWKEY.match(ln)), None)
    if first is None:
        return None
    header_line = next((txt[i] for i in range(first - 1, -1, -1) if header_widths(txt[i])), None)
    widths = header_widths(header_line)
    header_pos = []
    for w in widths:
        m = re.search(r'(?<!\d)%d(?!\d)' % w, header_line[header_pos[-1][2] if header_pos else 0:])
        start = (header_pos[-1][2] if header_pos else 0) + m.start()
        header_pos.append((w, start + len(str(w)) / 2, start + len(str(w))))
    header_pos = [(w, x) for w, x, _ in header_pos]
    step = min(b[1] - a[1] for a, b in zip(header_pos, header_pos[1:]))
    cells = {}
    for ln in txt[first:]:
        m = ROWKEY.match(ln)
        if not m:
            continue
        h = int(m.group(1))
        prices = [(int(p.group(1).replace(' ', '')), (p.start(1) + p.end(1)) / 2) for p in PRICE.finditer(ln, m.end())]
        for w, v in _assign(header_pos, prices, step * 0.45).items():
            cells[(h, w)] = v
    return {'columns': widths, 'cells': cells}


def _tokens(chars):
    """Group chars of one line into tokens split by gaps > 2.5 pt; keeps x extents."""
    toks, cur = [], None
    for c in sorted((c for c in chars if not c['text'].isspace()), key=lambda c: c['x0']):
        if cur and c['x0'] - cur['x1'] <= 2.5:
            cur['text'] += c['text'] if c['x0'] - cur['x1'] <= 1.2 else ' ' + c['text']
            cur['x1'] = c['x1']
        else:
            cur = {'text': c['text'], 'x0': c['x0'], 'x1': c['x1']}
            toks.append(cur)
    return toks


def parse_chars(pdf, page):
    with pdfplumber.open(pdf) as doc:
        p = doc.pages[page - 1]
        chars = sorted(p.chars, key=lambda c: ((c['top'] + c['bottom']) / 2, c['x0']))
    clusters = []
    for c in chars:
        yc = (c['top'] + c['bottom']) / 2
        if clusters and abs(clusters[-1][0] - yc) <= 2.5:
            clusters[-1][1].append(c)
        else:
            clusters.append([yc, [c]])
    lines = [(_tokens(cs)) for _, cs in clusters]
    texts = [' '.join(t['text'] for t in ts) for ts in lines]
    first = next((i for i, s in enumerate(texts) if ROWKEY.match(s)), None)
    if first is None:
        return None
    hi = next((i for i in range(first - 1, -1, -1) if header_widths(texts[i])), None)
    widths = header_widths(texts[hi])
    header_pos = []
    for t in lines[hi]:
        for v in re.findall(r'\d{4,5}', t['text']):
            if int(v) in widths and int(v) not in [h[0] for h in header_pos]:
                header_pos.append((int(v), (t['x0'] + t['x1']) / 2))
    step = min(b[1] - a[1] for a, b in zip(header_pos, header_pos[1:]))
    cells = {}
    for ts, s in zip(lines[first:], texts[first:]):
        m = ROWKEY.match(s)
        if not m:
            continue
        h = int(m.group(1))
        prices = []
        for t in ts[1:]:
            for pm in PRICE.finditer(t['text']):
                prices.append((int(pm.group(1).replace(' ', '')), (t['x0'] + t['x1']) / 2))
        for w, v in _assign(header_pos, prices, step * 0.45).items():
            cells[(h, w)] = v
    return {'columns': widths, 'cells': cells}


def cross(pdf, page):
    a, b = parse_text(pdf, page), parse_chars(pdf, page)
    if a['columns'] != b['columns']:
        raise SystemExit(f'p{page}: header mismatch {a["columns"]} vs {b["columns"]}')
    conflicts = {k: (a['cells'][k], b['cells'][k]) for k in a['cells'].keys() & b['cells'].keys() if a['cells'][k] != b['cells'][k]}
    cells = {**a['cells'], **b['cells']}
    only = sorted(set(a['cells']) ^ set(b['cells']))
    return a['columns'], cells, conflicts, only


if __name__ == '__main__':
    pdf = sys.argv[1]
    for pg in map(int, sys.argv[2:]):
        cols, cells, conf, only = cross(pdf, pg)
        heights = sorted({h for h, _ in cells})
        per_row = {h: sum(1 for (hh, _) in cells if hh == h) for h in heights}
        print(f'p{pg}: cols {cols[0]}..{cols[-1]} ({len(cols)}) rows {per_row} conflicts {len(conf)} single {len(only)} {only[:6]}')
        for k, v in list(conf.items())[:5]:
            print('   CONFLICT', k, v)


def parse_lines(pdf, page):
    """Read the bordered table cell by cell from its ruling lines (pdfplumber table finder)."""
    with pdfplumber.open(pdf) as doc:
        tables = doc.pages[page - 1].extract_tables({'vertical_strategy': 'lines', 'horizontal_strategy': 'lines'})
    for t in tables:
        hdr_i = next((i for i, r in enumerate(t) if header_widths(' '.join((c or '') for c in r))), None)
        if hdr_i is None:
            continue
        widths = header_widths(' '.join((c or '') for c in t[hdr_i]))
        col_of = {}
        for j, c in enumerate(t[hdr_i]):
            v = (c or '').strip()
            if v.isdigit() and int(v) in widths:
                col_of[j] = int(v)
        extra = {}
        cells = {}
        for r in t[hdr_i + 1:]:
            vals = [(c or '').replace('\n', ' ').strip() for c in r]
            key = next((v for v in vals[:3] if re.fullmatch(r'\d{4}', v)), None)
            if key is None:
                # helper rows under the header: glass width, parking width (3–4 digit values per column)
                nums = {col_of[j]: int(v) for j, v in enumerate(vals) if j in col_of and re.fullmatch(r'\d{3,4}', v)}
                if len(nums) == len(widths):
                    extra.setdefault('glassWidth' if 'glassWidth' not in extra else 'parkingWidth', nums)
                continue
            for j, v in enumerate(vals):
                m = re.fullmatch(r'(\d{1,3}(?: \d{3})*) ?€', v)
                if j in col_of and m:
                    cells[(int(key), col_of[j])] = int(m.group(1).replace(' ', ''))
        return {'columns': widths, 'cells': cells, 'extra': extra}
    return None


def cross_lines(pdf, page):
    a, b = parse_lines(pdf, page), parse_chars(pdf, page)
    if a['columns'] != b['columns']:
        raise SystemExit(f'p{page}: header mismatch {a["columns"]} vs {b["columns"]}')
    conflicts = {k: (a['cells'][k], b['cells'].get(k)) for k in a['cells'] if b['cells'].get(k) not in (None, a['cells'][k])}
    only = sorted(set(a['cells']) ^ set(b['cells']))
    return a, conflicts, only


def text_rows(pdf, page):
    """pdftotext -layout rows: {height: [prices in reading order]} (includes side-table prices at the end)."""
    txt = subprocess.run(['pdftotext', '-f', str(page), '-l', str(page), '-layout', pdf, '-'],
                         capture_output=True, text=True, check=True).stdout.splitlines()
    out = {}
    for ln in txt:
        m = ROWKEY.match(ln)
        if m:
            out[int(m.group(1))] = [int(p.replace(' ', '')) for p in PRICE.findall(ln[m.end():])]
    return out


def verify_glass_page(pdf, page):
    """Lines reading is the reference; each cell must be confirmed by chars positions OR by text order."""
    a, conflicts, _ = cross_lines(pdf, page)
    b = parse_chars(pdf, page)
    tr = text_rows(pdf, page)
    unconfirmed, text_conflicts = [], []
    for h in sorted({h for h, _ in a['cells']}):
        row = [(w, a['cells'][(h, w)]) for w in a['columns'] if (h, w) in a['cells']]
        tvals = tr.get(h)
        text_ok = tvals is not None and tvals[:len(row)] == [v for _, v in row]
        if tvals is not None and not text_ok and len(tvals) >= len(row):
            text_conflicts.append(h)
        for w, v in row:
            if b['cells'].get((h, w)) != v and not text_ok:
                unconfirmed.append((h, w))
    return a, conflicts, text_conflicts, unconfirmed
