// Language parity check for the configurator dictionary (apps/configurator/i18n/index.js).
// Fails when a language misses a key that German has, has an extra key, changes a placeholder or tag, changes an array length,
// or when the shared language list (packages/shared/src/i18n.ts) and the dictionary disagree. Run: node tools/i18n-check.mjs
import { buildT } from '../apps/configurator/i18n/index.js';
import { readFileSync } from 'node:fs';

const T = buildT('catalogue');
const base = 'de';
const langsInDict = Object.keys(T);
const shared = readFileSync(new URL('../packages/shared/src/i18n.ts', import.meta.url), 'utf8');
const langsInShared = (shared.match(/export const LANGS: Lang\[\] = \[([^\]]+)\]/) || [, ''])[1].split(',').map((s) => s.replace(/['"\s]/g, '')).filter(Boolean);

const flat = (o, p = '', out = {}) => {
  if (o && typeof o === 'object') for (const k of Object.keys(o)) flat(o[k], p ? p + '.' + k : k, out);
  else out[p] = o;
  return out;
};
const tokens = (s) => (String(s).match(/\$\{[^}]*\}|\{[a-zA-Z0-9_]+\}|<\/?[a-z]+[^>]*>|&[a-z]+;/g) || []).sort().join('|');
const arrayLengths = (o, p = '', out = {}) => {
  for (const k of Object.keys(o || {})) { const v = o[k], q = p ? p + '.' + k : k; if (Array.isArray(v)) out[q] = v.length; else if (v && typeof v === 'object') arrayLengths(v, q, out); }
  return out;
};

const problems = [];
if ([...langsInDict].sort().join() !== [...langsInShared].sort().join()) problems.push(`language lists differ: dictionary [${langsInDict}] vs shared LANGS [${langsInShared}]`);
const ref = flat(T[base]), refArr = arrayLengths(T[base]);
for (const l of langsInDict) {
  if (l === base) continue;
  const cur = flat(T[l]), curArr = arrayLengths(T[l]);
  const missing = Object.keys(ref).filter((k) => !(k in cur)), extra = Object.keys(cur).filter((k) => !(k in ref));
  if (missing.length) problems.push(`${l}: ${missing.length} keys missing (e.g. ${missing.slice(0, 5).join(', ')})`);
  if (extra.length) problems.push(`${l}: ${extra.length} extra keys (e.g. ${extra.slice(0, 5).join(', ')})`);
  const tok = Object.keys(ref).filter((k) => typeof ref[k] === 'string' && typeof cur[k] === 'string' && tokens(ref[k]) !== tokens(cur[k]));
  if (tok.length) problems.push(`${l}: ${tok.length} strings change a placeholder or tag (e.g. ${tok.slice(0, 5).join(', ')})`);
  const arr = Object.keys(refArr).filter((k) => k in curArr && refArr[k] !== curArr[k]);
  if (arr.length) problems.push(`${l}: ${arr.length} lists have another length (e.g. ${arr.slice(0, 5).join(', ')})`);
  const cyr = Object.keys(cur).filter((k) => l !== 'ru' && typeof cur[k] === 'string' && /[А-Яа-яЁё]/.test(cur[k]) && !/ПРОВЕРИТЬ/.test(cur[k]));
  if (cyr.length) problems.push(`${l}: ${cyr.length} strings contain Cyrillic (e.g. ${cyr.slice(0, 5).join(', ')})`);
}
if (problems.length) { console.error('i18n check FAILED:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log(`i18n check passed: ${langsInDict.join(', ')} with ${Object.keys(ref).length} keys each`);
