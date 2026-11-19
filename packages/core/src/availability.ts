/**
 * Disponibilidade canônica de itens colecionáveis (badges, molduras, recompensas).
 *
 * Nesta etapa existem exatamente TRÊS classificações públicas:
 * - `standard`  → Padrão, persistido como `free`.
 * - `vip`       → VIP, persistido como `vip`.
 * - `exclusive` → Exclusivo, persistido como `exclusive`.
 *
 * Os valores persistidos `earnable` e `event`, já existentes no banco
 * (`frames_catalog.availability`, migration 0005), são PRESERVADOS: não são removidos,
 * sobrescritos nem convertidos. Eles não fazem parte das três classificações canônicas expostas
 * pela UI e por isso não têm rótulo público nesta etapa.
 *
 * Toda conversão entre o nome de domínio e o valor persistido acontece AQUI. Componentes e
 * repositories nunca comparam strings de disponibilidade diretamente.
 */

/** Classificações públicas canônicas (as únicas expostas pela UI nesta etapa). */
export const AVAILABILITY_KINDS = ['standard', 'vip', 'exclusive'] as const;
export type AvailabilityKind = (typeof AVAILABILITY_KINDS)[number];

/**
 * Valores aceitos na coluna persistida `availability` (CHECK da migration 0005).
 * Inclui os valores reservados legados que continuam válidos no banco.
 */
export const PERSISTED_AVAILABILITY_VALUES = [
  'free',
  'vip',
  'exclusive',
  'earnable',
  'event',
] as const;
export type PersistedAvailability = (typeof PERSISTED_AVAILABILITY_VALUES)[number];

/** Valores persistidos reservados, sem classificação pública canônica nesta etapa. */
export const RESERVED_PERSISTED_AVAILABILITY_VALUES = ['earnable', 'event'] as const;
export type ReservedPersistedAvailability = (typeof RESERVED_PERSISTED_AVAILABILITY_VALUES)[number];

/** Rótulos públicos (pt-BR) das três classificações canônicas. */
export const AVAILABILITY_LABELS: Readonly<Record<AvailabilityKind, string>> = {
  standard: 'Padrão',
  vip: 'VIP',
  exclusive: 'Exclusivo',
};

const KIND_TO_PERSISTED: Readonly<Record<AvailabilityKind, PersistedAvailability>> = {
  standard: 'free',
  vip: 'vip',
  exclusive: 'exclusive',
};

const PERSISTED_TO_KIND: Readonly<Record<PersistedAvailability, AvailabilityKind | null>> = {
  free: 'standard',
  vip: 'vip',
  exclusive: 'exclusive',
  // Reservados: válidos no banco, sem classificação pública canônica nesta etapa.
  earnable: null,
  event: null,
};

/** Domínio → persistido. Nunca gera `earnable`/`event` (reservados, não canônicos). */
export function toPersistedAvailability(kind: AvailabilityKind): PersistedAvailability {
  return KIND_TO_PERSISTED[kind];
}

export function isAvailabilityKind(value: unknown): value is AvailabilityKind {
  return typeof value === 'string' && (AVAILABILITY_KINDS as readonly string[]).includes(value);
}

export function isPersistedAvailability(value: unknown): value is PersistedAvailability {
  return (
    typeof value === 'string' &&
    (PERSISTED_AVAILABILITY_VALUES as readonly string[]).includes(value)
  );
}

export function isReservedPersistedAvailability(
  value: unknown,
): value is ReservedPersistedAvailability {
  return (
    typeof value === 'string' &&
    (RESERVED_PERSISTED_AVAILABILITY_VALUES as readonly string[]).includes(value)
  );
}

/**
 * Persistido → domínio.
 *
 * Retorna `null` para os valores reservados (`earnable`/`event`) e para valores desconhecidos: o
 * chamador decide como tratá-los sem inventar uma classificação pública que não existe.
 */
export function fromPersistedAvailability(value: string): AvailabilityKind | null {
  if (!isPersistedAvailability(value)) return null;
  return PERSISTED_TO_KIND[value];
}
