"""Char-level grid parser for the catalogues.

pdfplumber chars -> lines (clustered by y) -> text with spacing by x-gap -> regex rows.
Handles letter-spaced and tightly packed tables where pdftotext word order breaks.
"""
import re, json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from common import header_widths
import pdfplumber

PRICE = re.compile(r'(\d{1,3}(?: \d{3})*) ?€')
ROW = re.compile(r'^\s*(\d{4,5})\s+(?:(\d{1,2})\s+)?(?=\d{1,3}(?: \d{3})* ?€)')

def lines_of(page, ytol=2.5):
    chars = sorted(page.chars, key=lambda c: ((c['top'] + c['bottom']) / 2, c['x0']))
    clusters = []
    for c in chars:
        yc = (c['top'] + c['bottom']) / 2
        if clusters and abs(clusters[-1]['y'] - yc) <= ytol:
            clusters[-1]['chars'].append(c)
        else:
            clusters.append({'y': yc, 'chars': [c]})
    out = []
    for cl in clusters:
        cs = sorted(cl['chars'], key=lambda c: c['x0'])
        s, prev = '', None
        for c in cs:
            if c['text'].isspace():
                continue
            if prev is not None:
                gap = c['x0'] - prev['x1']
                if gap > 8: s += '    '
                elif gap > 1.2: s += ' '
            s += c['text']; prev = c
        out.append((cl['y'], cs[0]['x0'], s))
    return out

def parse(pdf_path, page_no, bbox=None):
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[page_no - 1]
        if bbox:
            page = page.crop(bbox)
        lines = lines_of(page)
    rows, header, first_i = [], None, None
    for i, (y, x, s) in enumerate(lines):
        m = ROW.match(s)
        if m:
            if first_i is None: first_i = i
            rows.append({'key': int(m.group(1)), 'louvers': int(m.group(2)) if m.group(2) else None,
                         'prices': [int(p.replace(' ', '')) for p in PRICE.findall(s[m.end():])]})
    if first_i is not None:
        for y, x, s in reversed(lines[:first_i]):
            header = header_widths(s)
            if header:
                break
    return {'columns': header, 'rows': rows}

if __name__ == '__main__':
    g = parse(sys.argv[1], int(sys.argv[2]))
    print(json.dumps(g))
