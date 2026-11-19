// Leitores seguros de `props` de bloco (o contrato permite objetos extensíveis `Record<string, unknown>`).
// Nada é interpretado como HTML: apenas strings/URLs/números seguros são expostos ao render.

export function readString(props: Record<string, unknown>, key: string): string | null {
  const value = props[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Aceita apenas `https:` e `mailto:` (nunca `javascript:`, `data:`, `http:`). */
export function readSafeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return url.toString();
    if (url.protocol === 'mailto:') return value;
    return null;
  } catch {
    return null;
  }
}

export function readRecordArray(
  props: Record<string, unknown>,
  key: string,
): Array<Record<string, unknown>> {
  const value = props[key];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item),
  );
}
