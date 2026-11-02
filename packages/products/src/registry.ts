import type { ProductModule } from './types';
import { pergolaLouvred } from './pergola-louvred';
import { pergolaSliding } from './pergola-sliding';
import { carport } from './carport';

// The configurator's entry catalog, in display order. Add a product by adding its
// module here — the shell renders it, no changes to the shell itself.
export const PRODUCTS: ProductModule[] = [pergolaLouvred, pergolaSliding, carport];

export const byId = (id: string): ProductModule | null => PRODUCTS.find((p) => p.id === id) || null;
