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

/** Powder-coating colour of the manufacturer palette (colors.json). */
export interface ColorEntry {
  id: string;
  name: string;
  nameRu: string;
  ral: string;
  group: ColorGroup;
  /** on-screen tone; for wood-like colours an approximate base tone (ASSUMPTION, visual only) */
  hex: string;
  finish: 'structured' | 'matt' | 'metallic' | 'wood';
}

export interface ColorData {
  colors: ColorEntry[];
  /** colours outside the palette, priced by group: any RAL, any metallic RAL, any structural colour */
  customGroups: { group: ColorGroup; name: string; nameRu: string }[];
}

export interface FabricCollection {
  id: string;
  maker: string;
  name: string;
  /** openness factor, % */
  openness: number;
  eurPerM2: number;
}

export interface FabricData {
  source: { file: string; pages: number[] };
  collections: FabricCollection[];
}

export type MotorBrand = 'wincontrol' | 'yooda' | 'somfy' | 'custom';

export interface ScreenMotor {
  brand: MotorBrand;
  index: string;
  model?: string;
  short?: boolean;
  control: 'wired' | 'radio' | 'solar';
  nm: number;
  price: number;
  minWidth: { adaptive: number; flush: number };
}

export interface ScreenMotorData {
  motors: (ScreenMotor & { source: { file: string; page: number } })[];
}

export interface ControlItem {
  brand: MotorBrand | 'any';
  index: string;
  kind: 'remote' | 'smart' | 'receiver' | 'pergolaUnit1' | 'pergolaUnit4' | 'pergolaRemote' | 'wind' | 'switch';
  /** pergola remote: price of each additional remote (the first one comes with the pergola) */
  additionalPrice?: number;
  name: string;
  description?: string;
  price: number;
  channels?: number;
  /** remote: wall-mounted transmitter (otherwise handheld) */
  wall?: boolean;
  /** wind sensor: radio (otherwise wired) */
  radio?: boolean;
  motors?: number;
  source: { file: string; page: number; also?: { file: string; page: number } };
}

export interface Catalog {
  version: string;
  tables: Record<string, GridTable>;
  coating: CoatingData;
  colors?: ColorData;
  fabrics?: FabricData;
  screenMotors?: ScreenMotorData;
  screenControls?: { items: ControlItem[] };
  /** scalar option prices (options-scalars.json) */
  optionScalars?: Record<string, unknown>;
}
