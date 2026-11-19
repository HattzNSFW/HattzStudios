/**
 * Fronteira de confiança da posse (B4.1 — auditoria).
 *
 * O IndexedDB/Dexie é armazenamento LOCAL: o usuário pode inserir/alterar qualquer registro
 * diretamente (devtools), inclusive `source: 'manual' | 'system_test'` e `isDemo: false`. Estes
 * testes provam que tais dados NUNCA são tratados como concessão administrativa autoritativa: a
 * autoridade só é reconhecida por uma `TrustedOwnershipAuthority` CONFIÁVEL (código), nunca por
 * campos persistidos. O padrão é fail-closed.
 *
 * A "fonte confiável simulada" abaixo representa a futura sincronização confiável: é criada pela
 * fábrica INTERNA (`@hattz/local-store/testing`), inalcançável pela interface pública de produção e
 * impossível de obter a partir dos dados que um usuário pode fabricar.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TrustedOwnershipAuthority } from '@hattz/core';
import { canEquipItem } from '@hattz/permissions';
import { createTrustedOwnershipAuthority } from '@hattz/local-store/testing';
import * as localStore from '@hattz/local-store';
import {
  CollectibleAuthorizationError,
  closeStudioDb,
  equipBadge,
  getStudioDb,
  grantBadge,
  type UserBadgeRecord,
} from '@hattz/local-store';

const EXCLUSIVE_BADGE = 'founder';

/** Prova opaca que apenas a autoridade confiável simulada aceita. */
const SIMULATED_PROOF = 'simulated-trusted-signed-grant';

/** Fonte confiável SIMULADA (código). Um usuário não pode injetá-la via IndexedDB. */
const simulatedTrustedAuthority = createTrustedOwnershipAuthority((ownership) =>
  ownership.authorityProof === SIMULATED_PROOF
    ? { authoritative: true, reason: null }
    : { authoritative: false, reason: 'no_trusted_authority' },
);

async function resetDb(): Promise<void> {
  try {
    await getStudioDb().delete();
  } finally {
    await closeStudioDb();
  }
}

function ctx(profileTechnicalId: string) {
  return { role: 'member' as const, profileTechnicalId, adminSession: null };
}

function makeBadgeRecord(
  profileTechnicalId: string,
  overrides: Partial<UserBadgeRecord> = {},
): UserBadgeRecord {
  return {
    id: `ubadge_${Math.random().toString(36).slice(2)}`,
    profileTechnicalId,
    badgeKey: EXCLUSIVE_BADGE,
    source: 'manual',
    sourceRef: null,
    grantedAt: Date.now(),
    revokedAt: null,
    revokeReason: null,
    isEquipped: false,
    isFavorite: false,
    sortOrder: null,
    isDemo: false,
    authorityProof: null,
    metadata: {},
    ...overrides,
  };
}

describe('fronteira de confiança da posse (IndexedDB controlável pelo usuário)', () => {
  beforeEach(resetDb);
  afterEach(resetDb);

  it('1. recusa equipar posse Exclusiva criada diretamente no Dexie', async () => {
    const db = getStudioDb();
    await db.open();
    await db.userBadges.put(makeBadgeRecord('prof_1', { source: 'manual', isDemo: false }));

    await expect(equipBadge(ctx('prof_1'), 'prof_1', EXCLUSIVE_BADGE)).rejects.toBeInstanceOf(
      CollectibleAuthorizationError,
    );
  });

  it('2. recusa equipar quando o usuário altera `source` de uma posse existente', async () => {
    const db = getStudioDb();
    await db.open();
    const record = makeBadgeRecord('prof_2', { source: 'automatic', isDemo: false });
    await db.userBadges.put(record);

    for (const source of [
      'manual',
      'system_test',
      'role',
      'event',
      'collection_reward',
      'automatic',
    ] as const) {
      await db.userBadges.update(record.id, { source });
      await expect(equipBadge(ctx('prof_2'), 'prof_2', EXCLUSIVE_BADGE)).rejects.toBeInstanceOf(
        CollectibleAuthorizationError,
      );
    }
  });

  it('3. recusa equipar quando o usuário muda `isDemo` de true para false', async () => {
    const db = getStudioDb();
    await db.open();
    const record = makeBadgeRecord('prof_3', { source: 'automatic', isDemo: true });
    await db.userBadges.put(record);
    await db.userBadges.update(record.id, { isDemo: false });

    await expect(equipBadge(ctx('prof_3'), 'prof_3', EXCLUSIVE_BADGE)).rejects.toBeInstanceOf(
      CollectibleAuthorizationError,
    );
  });

  it('4. recusa `source:"manual"` inserido sem autorização (não é concessão)', async () => {
    const db = getStudioDb();
    await db.open();
    await db.userBadges.put(
      makeBadgeRecord('prof_4', { source: 'manual', isDemo: false, authorityProof: null }),
    );

    await expect(equipBadge(ctx('prof_4'), 'prof_4', EXCLUSIVE_BADGE)).rejects.toBeInstanceOf(
      CollectibleAuthorizationError,
    );
  });

  it('5. recusa `source:"system_test"` como autoridade em produção', async () => {
    const db = getStudioDb();
    await db.open();
    await db.userBadges.put(
      makeBadgeRecord('prof_5', { source: 'system_test', isDemo: false, authorityProof: null }),
    );

    await expect(equipBadge(ctx('prof_5'), 'prof_5', EXCLUSIVE_BADGE)).rejects.toBeInstanceOf(
      CollectibleAuthorizationError,
    );

    // Também no motor puro, sem verificador confiável.
    expect(
      canEquipItem(
        ctx('prof_5'),
        { itemType: 'badge', itemKey: EXCLUSIVE_BADGE, availability: 'exclusive' },
        {
          profileTechnicalId: 'prof_5',
          itemKey: EXCLUSIVE_BADGE,
          source: 'system_test',
          revokedAt: null,
          isDemo: false,
          authorityProof: null,
        },
      ),
    ).toEqual({ allowed: false, reason: 'ownership_not_verified' });
  });

  it('6. recusa reutilizar registros de outro perfil', async () => {
    const db = getStudioDb();
    await db.open();
    await db.userBadges.put(
      makeBadgeRecord('prof_owner', { source: 'manual', authorityProof: SIMULATED_PROOF }),
    );

    // Intruso tenta equipar a posse de outro perfil.
    await expect(
      equipBadge(ctx('prof_intruder'), 'prof_owner', EXCLUSIVE_BADGE),
    ).rejects.toBeInstanceOf(CollectibleAuthorizationError);

    // No motor puro: o contexto do intruso não corresponde à posse.
    expect(
      canEquipItem(
        ctx('prof_intruder'),
        { itemType: 'badge', itemKey: EXCLUSIVE_BADGE, availability: 'exclusive' },
        {
          profileTechnicalId: 'prof_owner',
          itemKey: EXCLUSIVE_BADGE,
          source: 'manual',
          revokedAt: null,
          isDemo: false,
          authorityProof: SIMULATED_PROOF,
        },
        simulatedTrustedAuthority,
      ),
    ).toEqual({ allowed: false, reason: 'profile_mismatch' });
  });

  it('7. recusa equipar uma posse não validada (verificador padrão fail-closed)', async () => {
    const db = getStudioDb();
    await db.open();
    await db.userBadges.put(
      makeBadgeRecord('prof_7', { source: 'manual', isDemo: false, authorityProof: null }),
    );

    await expect(equipBadge(ctx('prof_7'), 'prof_7', EXCLUSIVE_BADGE)).rejects.toBeInstanceOf(
      CollectibleAuthorizationError,
    );
  });

  it('8. equipa Exclusivo legitimamente validado por uma fonte confiável simulada', async () => {
    const db = getStudioDb();
    await db.open();
    await db.userBadges.put(
      makeBadgeRecord('prof_8', {
        source: 'manual',
        isDemo: false,
        authorityProof: SIMULATED_PROOF,
      }),
    );

    // Sem a autoridade confiável (produção local): negado.
    await expect(equipBadge(ctx('prof_8'), 'prof_8', EXCLUSIVE_BADGE)).rejects.toBeInstanceOf(
      CollectibleAuthorizationError,
    );

    // Com a autoridade confiável simulada: permitido.
    const equipped = await equipBadge(ctx('prof_8'), 'prof_8', EXCLUSIVE_BADGE, {
      authority: simulatedTrustedAuthority,
    });
    expect(equipped.isEquipped).toBe(true);
  });

  it('distingue fixture confiável de teste de registro fabricado localmente', async () => {
    const db = getStudioDb();
    await db.open();

    // (a) Registro FABRICADO localmente: campos "de autoridade" (source manual, isDemo false),
    // porém sem prova verificável → negado.
    await db.userBadges.put(
      makeBadgeRecord('prof_fake', { source: 'manual', isDemo: false, authorityProof: null }),
    );
    await expect(equipBadge(ctx('prof_fake'), 'prof_fake', EXCLUSIVE_BADGE)).rejects.toBeInstanceOf(
      CollectibleAuthorizationError,
    );

    // (b) Fixture equivalente, mas com prova aceita por uma autoridade CONFIÁVEL (simulada).
    // A diferença NÃO está nos dados (fabricáveis): está na autoridade (código, não injetável
    // pelo usuário). Sem ela, o mesmo registro é negado.
    await db.userBadges.put(
      makeBadgeRecord('prof_real', {
        source: 'manual',
        isDemo: false,
        authorityProof: SIMULATED_PROOF,
      }),
    );
    await expect(equipBadge(ctx('prof_real'), 'prof_real', EXCLUSIVE_BADGE)).rejects.toBeInstanceOf(
      CollectibleAuthorizationError,
    );
    const equipped = await equipBadge(ctx('prof_real'), 'prof_real', EXCLUSIVE_BADGE, {
      authority: simulatedTrustedAuthority,
    });
    expect(equipped.isEquipped).toBe(true);
  });
});

describe('fronteira de injeção da autoridade (API pública não substituível)', () => {
  beforeEach(resetDb);
  afterEach(resetDb);

  it('1. a interface pública não expõe a fábrica de autoridade confiável', () => {
    // A fábrica e a guarda vivem apenas no subcaminho de teste, fora do índice público.
    expect('createTrustedOwnershipAuthority' in localStore).toBe(false);
    expect('isTrustedOwnershipAuthority' in localStore).toBe(false);

    // Verificação de TIPO: uma função verificadora permissiva NÃO é uma autoridade confiável.
    // @ts-expect-error — falta a marca opaca e o método `verify`.
    const _notAnAuthority: TrustedOwnershipAuthority = () => ({
      authoritative: true,
      reason: null,
    });
    void _notAnAuthority;
  });

  it('2. recusa uma autoridade forjada (objeto fabricado com `as`)', async () => {
    const db = getStudioDb();
    await db.open();
    await db.userBadges.put(
      makeBadgeRecord('prof_forge', {
        source: 'manual',
        isDemo: false,
        authorityProof: SIMULATED_PROOF,
      }),
    );

    // Objeto com a "forma" certa, mas NÃO produzido pela fábrica interna.
    const forged = {
      verify: () => ({ authoritative: true, reason: null }),
    } as unknown as TrustedOwnershipAuthority;
    await expect(
      equipBadge(ctx('prof_forge'), 'prof_forge', EXCLUSIVE_BADGE, { authority: forged }),
    ).rejects.toBeInstanceOf(CollectibleAuthorizationError);

    // Uma função verificadora também é recusada: o parâmetro deixou de ser uma função arbitrária.
    const forgedFunction = (() => ({
      authoritative: true,
      reason: null,
    })) as unknown as TrustedOwnershipAuthority;
    await expect(
      equipBadge(ctx('prof_forge'), 'prof_forge', EXCLUSIVE_BADGE, { authority: forgedFunction }),
    ).rejects.toBeInstanceOf(CollectibleAuthorizationError);
  });

  it('3. a autoridade padrão nega posse Exclusiva não validada', async () => {
    const db = getStudioDb();
    await db.open();
    await db.userBadges.put(makeBadgeRecord('prof_default', { source: 'manual', isDemo: false }));

    await expect(
      equipBadge(ctx('prof_default'), 'prof_default', EXCLUSIVE_BADGE),
    ).rejects.toBeInstanceOf(CollectibleAuthorizationError);
  });

  it('4. a simulação não concede autoridade persistente aos registros do IndexedDB', async () => {
    const db = getStudioDb();
    await db.open();
    await db.userBadges.put(
      makeBadgeRecord('prof_sim', {
        source: 'manual',
        isDemo: false,
        authorityProof: SIMULATED_PROOF,
      }),
    );

    // Com a autoridade simulada: equipa.
    const equipped = await equipBadge(ctx('prof_sim'), 'prof_sim', EXCLUSIVE_BADGE, {
      authority: simulatedTrustedAuthority,
    });
    expect(equipped.isEquipped).toBe(true);

    // O registro persistido NÃO é "promovido": nenhuma autoridade é gravada nele.
    const stored = await db.userBadges.get(equipped.id);
    expect(stored?.authorityProof).toBe(SIMULATED_PROOF);
    expect(stored?.source).toBe('manual');

    // A autoridade vive no CÓDIGO, não no dado: sem ela, o MESMO registro é negado.
    await db.userBadges.update(equipped.id, { isEquipped: false });
    await expect(equipBadge(ctx('prof_sim'), 'prof_sim', EXCLUSIVE_BADGE)).rejects.toBeInstanceOf(
      CollectibleAuthorizationError,
    );
  });

  it('5. mantém inalterado o comportamento de itens Padrão e VIP', async () => {
    // Padrão: equipa sem qualquer autoridade.
    await grantBadge(ctx('prof_std'), {
      profileTechnicalId: 'prof_std',
      badgeKey: 'early-member',
      source: 'automatic',
    });
    expect((await equipBadge(ctx('prof_std'), 'prof_std', 'early-member')).isEquipped).toBe(true);

    // VIP: posse não basta; exige cargo elegível. A autoridade de posse NÃO interfere.
    const db = getStudioDb();
    await db.open();
    await db.userBadges.put(
      makeBadgeRecord('prof_vip', { badgeKey: 'vip-supporter', source: 'role', isDemo: false }),
    );
    await expect(
      equipBadge(
        { role: 'member', profileTechnicalId: 'prof_vip', adminSession: null },
        'prof_vip',
        'vip-supporter',
      ),
    ).rejects.toBeInstanceOf(CollectibleAuthorizationError);
    const vipEquipped = await equipBadge(
      { role: 'vip', profileTechnicalId: 'prof_vip', adminSession: null },
      'prof_vip',
      'vip-supporter',
    );
    expect(vipEquipped.isEquipped).toBe(true);
  });
});
