import { describe, expect, it } from 'vitest';
import {
  AVAILABILITY_KINDS,
  AVAILABILITY_LABELS,
  PERSISTED_AVAILABILITY_VALUES,
  RESERVED_PERSISTED_AVAILABILITY_VALUES,
  fromPersistedAvailability,
  isAvailabilityKind,
  isPersistedAvailability,
  isReservedPersistedAvailability,
  toPersistedAvailability,
} from '@hattz/core';

describe('disponibilidade canônica (AvailabilityKind)', () => {
  it('expõe exatamente três classificações públicas', () => {
    expect(AVAILABILITY_KINDS).toEqual(['standard', 'vip', 'exclusive']);
    expect(AVAILABILITY_KINDS).toHaveLength(3);
    expect(AVAILABILITY_LABELS.standard).toBe('Padrão');
    expect(AVAILABILITY_LABELS.vip).toBe('VIP');
    expect(AVAILABILITY_LABELS.exclusive).toBe('Exclusivo');
  });

  it('mapeia domínio -> persistido (Padrão = free)', () => {
    expect(toPersistedAvailability('standard')).toBe('free');
    expect(toPersistedAvailability('vip')).toBe('vip');
    expect(toPersistedAvailability('exclusive')).toBe('exclusive');
  });

  it('mapeia persistido -> domínio', () => {
    expect(fromPersistedAvailability('free')).toBe('standard');
    expect(fromPersistedAvailability('vip')).toBe('vip');
    expect(fromPersistedAvailability('exclusive')).toBe('exclusive');
  });

  it('preserva os valores persistidos reservados earnable/event', () => {
    expect(PERSISTED_AVAILABILITY_VALUES).toContain('earnable');
    expect(PERSISTED_AVAILABILITY_VALUES).toContain('event');
    expect(RESERVED_PERSISTED_AVAILABILITY_VALUES).toEqual(['earnable', 'event']);
    expect(isReservedPersistedAvailability('earnable')).toBe(true);
    expect(isReservedPersistedAvailability('event')).toBe(true);
    expect(isReservedPersistedAvailability('free')).toBe(false);
    // Reservados continuam válidos no banco, mas sem classificação pública canônica.
    expect(isPersistedAvailability('earnable')).toBe(true);
    expect(isPersistedAvailability('event')).toBe(true);
    expect(fromPersistedAvailability('earnable')).toBeNull();
    expect(fromPersistedAvailability('event')).toBeNull();
  });

  it('não gera valores reservados nem aceita desconhecidos', () => {
    for (const kind of AVAILABILITY_KINDS) {
      const persisted = toPersistedAvailability(kind);
      expect(isReservedPersistedAvailability(persisted)).toBe(false);
      expect(fromPersistedAvailability(persisted)).toBe(kind);
    }
    expect(isAvailabilityKind('standard')).toBe(true);
    expect(isAvailabilityKind('free')).toBe(false);
    expect(isAvailabilityKind('earnable')).toBe(false);
    expect(fromPersistedAvailability('desconhecido')).toBeNull();
  });
});
