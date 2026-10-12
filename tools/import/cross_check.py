"""Run both parsers on a page, merge rows, report conflicts and gaps."""
import json, sys
sys.path.insert(0, 'tools/import')
from grid_parser import parse_grid as parse_text
from grid_chars import parse as parse_chars

def merged(pdf, page):
    a, b = parse_text(pdf, page), parse_chars(pdf, page)
    cols = a['columns'] or b['columns']
    if a['columns'] and b['columns'] and a['columns'] != b['columns']:
        raise SystemExit(f'p{page}: header mismatch {a["columns"]} vs {b["columns"]}')
    ra = {r['key']: r for r in a['rows'] if len(r['prices']) == len(cols)}
    rb = {r['key']: r for r in b['rows'] if len(r['prices']) == len(cols)}
    rows, conflicts, single = {}, [], []
    for k in sorted(set(ra) | set(rb)):
        if k in ra and k in rb:
            if ra[k]['prices'] != rb[k]['prices'] or ra[k]['louvers'] != rb[k]['louvers']:
                conflicts.append((k, ra[k], rb[k]))
            rows[k] = ra[k]
        else:
            rows[k] = ra.get(k) or rb.get(k); single.append(k)
    return cols, rows, conflicts, single

if __name__ == '__main__':
    pdf = sys.argv[1]
    for pg in map(int, sys.argv[2:]):
        cols, rows, conf, single = merged(pdf, pg)
        print(f'p{pg}: cols={len(cols)} rows={len(rows)} keys={min(rows)}..{max(rows)} conflicts={len(conf)} only-one-parser={single}')
        for c in conf: print('   CONFLICT', c)
