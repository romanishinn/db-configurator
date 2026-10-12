import re

NUM = re.compile(r'(?<![\d ])(\d{4,5})(?![\d])|(?<!\d)(\d{1,3})(?!\d)')

def header_widths(line: str):
    """Width header of a price grid: the longest run of >= 3 ascending 4–5 digit values >= 1800 mm.

    Rejects helper rows (glass width, parking width: all < 1800 or starting with 3-digit values)
    and tolerates stray numbers from drawings elsewhere on the same text line.
    """
    if '€' in line:
        return None
    tokens = re.findall(r'(?<!\d)\d{3,5}(?!\d)', line)
    best, run = [], []
    for tok in tokens:
        v = int(tok)
        if len(tok) >= 4 and v >= 1800 and (not run or v > run[-1]):
            run.append(v)
        else:
            if len(run) > len(best): best = run
            run = [v] if len(tok) >= 4 and v >= 1800 else []
    if len(run) > len(best): best = run
    return best if len(best) >= 3 else None
