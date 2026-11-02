// Tiny DOM helpers shared across apps.
export const byId = (id: string): HTMLElement | null => document.getElementById(id);

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }) as Record<string, string>)[c]!);
