import type { Dict } from '@db/shared';

/** engine roof family a product maps to */
export type RoofFamily = 'rotating' | 'sliding';

/**
 * A product shown on the configurator's entry catalog. Today a product carries its
 * catalog card (name/tag/icon) and which engine family it uses. Behaviour that is still
 * inside the shared shell — steps, 3D scene, quote mapping — will move onto this contract
 * as each product is split out; those hooks are intentionally optional for now.
 */
export interface ProductModule {
  id: string;
  name: Dict;
  tag: Dict;
  /** catalog glyph */
  ic: string;
  /** which engine family to compose with; absent for a locked/coming-soon product */
  roof?: RoofFamily;
  /** greyed out, not selectable yet */
  locked?: boolean;
}

export type { Dict };
