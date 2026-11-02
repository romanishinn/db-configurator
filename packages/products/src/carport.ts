import type { ProductModule } from './types';

// Coming soon: shown greyed with a padlock. To launch, give it a roof family and
// remove `locked` (and wire its steps/scene when its logic is split out).
export const carport: ProductModule = {
  id: 'carport',
  locked: true,
  ic: '▭',
  name: { de: 'Carport', en: 'Carport', ru: 'Навес для авто' },
  tag: { de: 'Bald verfügbar', en: 'Coming soon', ru: 'Скоро' },
};
