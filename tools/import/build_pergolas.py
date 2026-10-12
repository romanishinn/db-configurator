"""Build JSON price tables for Win Climatic S400 / S500 from the 07.2026 catalogs.

Every table keeps its source (file + page). Two independent parsers are cross-checked;
rows only one parser found, and manual fixes, were verified against page images.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from cross_check import merged
import pdfplumber
from grid_chars import lines_of, PRICE

SRC = os.environ.get('SW_PDF_DIR', '/mnt/user-data/uploads/Price')
OUT = 'data/sunwinner/2026-07/tables'
S400 = 'WIN-CLIMATIC-S400-EN-07.2026.pdf'
S500 = 'WIN-CLIMATIC-S500-EN-07.2026.pdf'

TABLES = [
    # id, file, page, title
    ('s400.wall', S400, 13, 'S400 — пристенная (1–2 стойки + 2–3 кронштейна)'),
    ('s400.free', S400, 14, 'S400 — отдельностоящая (4 стойки)'),
    ('s400.roof', S400, 15, 'S400 — кровельный модуль (8–10 кронштейнов)'),
    ('s500.single.wall.base', S500, 14, 'S500 одинарная — пристенная, базовый модуль'),
    ('s500.single.wall.add', S500, 15, 'S500 одинарная — пристенная, доп. модуль'),
    ('s500.single.free.base', S500, 20, 'S500 одинарная — отдельностоящая, базовый модуль'),
    ('s500.single.free.add', S500, 21, 'S500 одинарная — отдельностоящая, доп. модуль'),
    ('s500.single.roof.base', S500, 23, 'S500 одинарная — кровельный модуль, базовый'),
    ('s500.single.roof.add', S500, 24, 'S500 одинарная — кровельный модуль, доп.'),
    ('s500.double.wall.base', S500, 29, 'S500 двойная без центр. стойки — пристенная, базовый'),
    ('s500.double.wall.add', S500, 30, 'S500 двойная без центр. стойки — пристенная, доп.'),
    ('s500.double.free.base', S500, 33, 'S500 двойная без центр. стойки — отдельностоящая, базовый'),
    ('s500.double.free.add', S500, 34, 'S500 двойная без центр. стойки — отдельностоящая, доп.'),
    ('s500.double.roof.base', S500, 36, 'S500 двойная без центр. стойки — кровельный, базовый'),
    ('s500.double.roof.add', S500, 37, 'S500 двойная без центр. стойки — кровельный, доп.'),
]

# Rows missed by both parsers, read from the page image (110 dpi) and entered by hand.
MANUAL = {
    ('s500.single.roof.add', 2000): (6, [4343, 4614, 4788, 5245, 5618, 5689, 5988, 6105, 6548, 6548, 7256]),
}
# Rows found by one parser only — each checked against the page image.
VERIFIED_SINGLE = {
    's400.wall': [3800], 's500.single.wall.base': [2250, 5500, 6250], 's500.single.free.base': [7500, 7750],
    's500.single.free.add': [2000], 's500.single.roof.base': [8000],
    's500.single.roof.add': [2500, 3250, 4000, 6500, 7250], 's500.double.roof.base': [4000],
}

def expected_rows(tid):
    if tid.startswith('s400'): return list(range(2000, 7001, 200))
    if '.double.' in tid: return list(range(2000, 7001, 250))
    return list(range(2000, 8001, 250))

def write(table):
    os.makedirs(OUT, exist_ok=True)
    with open(f"{OUT}/{table['id']}.json", 'w', encoding='utf-8') as f:
        json.dump(table, f, ensure_ascii=False, indent=1)

def build_grid(tid, fname, page, title):
    cols, rows, conflicts, single = merged(f'{SRC}/{fname}', page)
    if conflicts:
        raise SystemExit(f'{tid}: parser conflicts {conflicts}')
    unverified = [k for k in single if k not in VERIFIED_SINGLE.get(tid, [])]
    if unverified:
        raise SystemExit(f'{tid}: rows from one parser not verified: {unverified}')
    for (t, k), (louv, prices) in MANUAL.items():
        if t == tid:
            rows[k] = {'key': k, 'louvers': louv, 'prices': prices}
    exp = expected_rows(tid)
    missing = [k for k in exp if k not in rows]
    extra = [k for k in rows if k not in exp]
    if missing or extra:
        raise SystemExit(f'{tid}: missing {missing} extra {extra}')
    return {
        'id': tid, 'title': title, 'kind': 'grid2d', 'currency': 'EUR', 'priceType': 'catalog_net',
        'source': {'file': fname, 'page': page},
        'x': {'name': 'width', 'unit': 'mm', 'values': cols},
        'y': {'name': 'projection', 'unit': 'mm', 'values': exp},
        'rounding': 'ceil',
        'louvers': [rows[k]['louvers'] for k in exp],
        'prices': [rows[k]['prices'] for k in exp],
        'manualRows': [k for (t, k) in MANUAL if t == tid],
    }

def build_noroof():
    """S500 additional module without roof (p.28): projection rows are merged in groups."""
    with pdfplumber.open(f'{SRC}/{S500}') as pdf:
        ls = lines_of(pdf.pages[27])
    prow = [[int(p.replace(' ', '')) for p in PRICE.findall(s)] for _, _, s in ls]
    prow = [r for r in prow if len(r) == 11]
    groups = [[2000], [2250], [2500], [2750], [3000], [3250], [3500],
              [3750, 4000], [4250, 4500], [4750, 5000], [5250, 5500], [5750, 6000], [6250, 6500], [6750, 7000],
              [7250, 7500, 7750, 8000]]
    assert len(prow) == len(groups), len(prow)
    ys, prices = [], []
    for g, r in zip(groups, prow):
        for y in g:
            ys.append(y); prices.append(r)
    return {
        'id': 's500.single.noroof.add', 'title': 'S500 — доп. модуль без крыши', 'kind': 'grid2d',
        'currency': 'EUR', 'priceType': 'catalog_net', 'source': {'file': S500, 'page': 28},
        'x': {'name': 'width', 'unit': 'mm', 'values': [2000, 2250, 2500, 3000, 3250, 3500, 3750, 4000, 4250, 4500, 5000]},
        'y': {'name': 'projection', 'unit': 'mm', 'values': ys}, 'rounding': 'ceil', 'louvers': None,
        'prices': prices, 'note': 'Строки вылета объединены в группы в самом прайсе (например, 3750 и 4000 — одна цена).',
    }

def monotonic_issues(t):
    out = []
    P, xs, ys = t['prices'], t['x']['values'], t['y']['values']
    for i, row in enumerate(P):
        for j in range(1, len(row)):
            if row[j] < row[j - 1]: out.append(f"y={ys[i]}: x {xs[j-1]}→{xs[j]} {row[j-1]}→{row[j]}")
    for j in range(len(xs)):
        for i in range(1, len(ys)):
            if P[i][j] < P[i - 1][j]: out.append(f"x={xs[j]}: y {ys[i-1]}→{ys[i]} {P[i-1][j]}→{P[i][j]}")
    return out

if __name__ == '__main__':
    index, report = [], []
    for spec in TABLES:
        t = build_grid(*spec); write(t); index.append(t['id'])
        report.append((t['id'], len(t['y']['values']) * len(t['x']['values']), monotonic_issues(t)))
    t = build_noroof(); write(t); index.append(t['id'])
    report.append((t['id'], len(t['y']['values']) * len(t['x']['values']), monotonic_issues(t)))
    for tid, n, issues in report:
        print(f'{tid}: {n} cells, monotonic issues: {len(issues)}')
        for i in issues: print('    ', i)
    print('total cells', sum(n for _, n, _ in report))
