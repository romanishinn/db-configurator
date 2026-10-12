"""Win Screen fabric surcharges (07.2026): EUR per m2 of the screen (width x height), by fabric collection.

Two independent readings of every "SURCHARGES FOR FABRICS" table in the Win Screen catalogue
(pdfplumber text and pdftotext -layout). All tables in the catalogue must agree with each other,
otherwise the build stops.
Fabric colour cards are not in the price catalogue; the per-collection colour lists come later.
"""
import json, os, re, subprocess
import pdfplumber

SRC = os.environ.get('SW_PDF_DIR', '/mnt/user-data/uploads/Price')
FILE = 'WIN-SCREEN-EN-07.2026-.pdf'
OUT = 'data/catalog/2026-07/fabrics.json'
ROW = re.compile(r'(SERGE FERRARI|COPACO)\s+([A-Z0-9 ]+?)\s+\(OF (\d+)%\)\s+(IN PRICE|\d+\s?€)')


def rows(text):
    out = []
    for m in ROW.finditer(text):
        maker, name, of, price = m.group(1), m.group(2).strip(), int(m.group(3)), m.group(4)
        out.append((maker, name, of, 0 if price == 'IN PRICE' else int(price.replace('€', '').strip())))
    return out


def build():
    pdf = os.path.join(SRC, FILE)
    found = {}
    with pdfplumber.open(pdf) as d:
        for i, p in enumerate(d.pages):
            t = p.extract_text() or ''
            if 'SURCHARGES FOR FABRICS' not in t:
                continue
            a = rows(t[t.index('SURCHARGES FOR FABRICS'):])
            lay = subprocess.run(['pdftotext', '-f', str(i + 1), '-l', str(i + 1), '-layout', pdf, '-'], capture_output=True, text=True, check=True).stdout
            b = rows(re.sub(r' {2,}', ' ', lay[lay.index('SURCHARGES FOR FABRICS'):]))
            if a != b[:len(a)] or len(a) < 6:
                raise SystemExit(f'p{i + 1}: parsers disagree\n{a}\n{b}')
            found[i + 1] = a
    pages = sorted(found)
    first = found[pages[0]]
    for pg in pages:
        if found[pg] != first:
            raise SystemExit(f'p{pg}: fabric table differs from p{pages[0]}')
    out = {
        'source': {'file': FILE, 'pages': pages, 'note': __doc__.strip()},
        'unit': 'EUR/m2',
        'collections': [
            {'id': re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-'), 'maker': maker.title(), 'name': ' '.join(w if len(w) <= 2 else w.title() for w in name.split()), 'openness': of, 'eurPerM2': eur}
            for maker, name, of, eur in first
        ],
    }
    with open(OUT, 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f'{len(first)} collections, identical on pages {pages}')


if __name__ == '__main__':
    build()
