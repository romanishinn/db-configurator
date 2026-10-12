import type { GridTable } from './types';

export class OutOfRangeError extends Error {
  constructor(public readonly axis: 'x' | 'y', public readonly value: number, public readonly min: number, public readonly max: number) {
    super(`${axis}=${value} outside ${min}..${max}`);
  }
}

/** Smallest grid value >= v (catalogue rule: sizes between steps are billed at the next step). */
export function ceilBucket(values: number[], v: number, axis: 'x' | 'y'): { value: number; index: number } {
  const min = values[0]!;
  const max = values.at(-1)!;
  if (v < min || v > max) throw new OutOfRangeError(axis, v, min, max);
  const index = values.findIndex((g) => g >= v);
  return { value: values[index]!, index };
}

export function lookupGrid(t: GridTable, x: number, y: number) {
  const bx = ceilBucket(t.x.values, x, 'x');
  const by = ceilBucket(t.y.values, y, 'y');
  const price = t.prices[by.index]![bx.index]!;
  return {
    price,
    x: bx.value,
    y: by.value,
    louvers: t.louvers ? t.louvers[by.index] ?? null : null,
    source: { file: t.source.file, page: t.source.page, table: t.id, cell: { x: bx.value, y: by.value } },
  };
}
