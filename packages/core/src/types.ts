export interface Axis {
  name: string;
  unit: 'mm';
  values: number[];
}

export interface GridTable {
  id: string;
  title: string;
  kind: 'grid2d';
  currency: 'EUR';
  source: { file: string; page: number; pages?: number[] };
  x: Axis;
  y: Axis;
  rounding: 'ceil';
  louvers: (number | null)[] | null;
  /** prices[yIndex][xIndex], catalogue net EUR; null = this size is not produced (ragged tables, Win Glass) */
  prices: (number | null)[][];
  meta?: Record<string, unknown>;
}

export type Severity = 'block' | 'warn' | 'info';

export interface Issue {
  severity: Severity;
  code: string;
  params?: Record<string, string | number>;
}

export interface SourceRef {
  file?: string;
  page?: number;
  table?: string;
  cell?: { x: number; y: number };
  url?: string;
}

export interface Line {
  code: string;
  params?: Record<string, string | number>;
  amount: number;
  source?: SourceRef;
}

export interface PriceResult {
  lines: Line[];
  total: number;
  issues: Issue[];
}

export type ColorGroup =
  | 'standard' | 'fine' | 'smooth' | 'ralAny' | 'ralMetallic'
  | 'structural' | 'structuralRal' | 'exclusive' | 'wood';

export interface CoatingData {
  rates: Record<string, Record<ColorGroup, number | [number, number, number]>>;
  minimumCharge: { default: number; wood: number; flashingAndAngles: number };
}

export interface Catalog {
  version: string;
  tables: Record<string, GridTable>;
  coating: CoatingData;
}
