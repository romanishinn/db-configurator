"""Parse 2D price grids (pergola-style) from Sun Winner catalog pages.

Row format in `pdftotext -layout` output:
    <row key mm> [<louver count>] <price €> <price €> ...
Header: a line with >=3 ascending 4-digit widths and no euro sign.
"""
import re, subprocess, json, sys

PRICE = re.compile(r'(\d{1,3}(?: \d{3})*) ?€')
ROW = re.compile(r'^\s*(\d{4})\s+(?:(\d{1,2})\s+)?(?=\d{1,3}(?: \d{3})* ?€)')

def page_text(pdf, page):
    return subprocess.run(['pdftotext', '-f', str(page), '-l', str(page), '-layout', pdf, '-'],
                          capture_output=True, text=True, check=True).stdout

def find_header(lines, upto):
    for i in range(upto - 1, -1, -1):
        ln = lines[i]
        if '€' in ln:
            continue
        nums = [int(n) for n in re.findall(r'(?<!\d)(\d{4})(?!\d)', ln)]
        if len(nums) >= 3 and nums == sorted(nums) and all(1000 <= n <= 20000 for n in nums):
            return nums
    return None

def parse_grid(pdf, page):
    lines = page_text(pdf, page).splitlines()
    rows, first = [], None
    for idx, ln in enumerate(lines):
        m = ROW.match(ln)
        if not m:
            continue
        prices = [int(p.replace(' ', '')) for p in PRICE.findall(ln[m.end(0) - 0:])]
        if first is None:
            first = idx
        rows.append({'key': int(m.group(1)), 'louvers': int(m.group(2)) if m.group(2) else None, 'prices': prices})
    header = find_header(lines, first) if first is not None else None
    return {'columns': header, 'rows': rows}

if __name__ == '__main__':
    pdf, page = sys.argv[1], int(sys.argv[2])
    g = parse_grid(pdf, page)
    print(json.dumps(g, ensure_ascii=False))
