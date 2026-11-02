// Shared i18n primitives used by every app (configurator shell, cabinet/CRM).
// The big per-screen dictionaries still live with their screens; this is the plumbing.
export type Lang = 'ru' | 'en' | 'de' | 'hr';
export const LANGS: Lang[] = ['ru', 'en', 'de', 'hr'];
export type Dict = Record<Lang, string>;

const KEY = 'dbp_lang';

export function getLang(fallback: Lang = 'ru'): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v && (LANGS as string[]).includes(v)) return v as Lang;
  } catch { /* storage blocked */ }
  return fallback;
}

export function setLang(l: Lang): void {
  try { localStorage.setItem(KEY, l); } catch { /* storage blocked */ }
}

/** value for the current language, falling back to EN then RU */
export function pick(d: Dict, l: Lang): string {
  return d[l] ?? d.en ?? d.ru;
}
