import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { denyAllOwnershipAuthority } from '@hattz/core';
import { canEquipItem } from '@hattz/permissions';
import {
  CollectibleAuthorizationError,
  DEMO_SEED_MARKER,
  closeStudioDb,
  demoAuthorizationContext,
  equipBadge,
  getActiveBadge,
  getStudioDb,
  grantBadge,
  listActiveBadges,
  listActiveFrames,
  revokeBadge,
  seedDemoCollectibles,
} from '@hattz/local-store';

const PROFILE = 'prof_demo_seed';

async function resetDb(): Promise<void> {
  try {
    await getStudioDb().delete();
  } finally {
    await closeStudioDb();
  }
}

describe('seed de demonstração read-only', () => {
  beforeEach(resetDb);
  afterEach(resetDb);

  it('semeia dados fictícios claramente marcados como demonstração', async () => {
    const result = await seedDemoCollectibles(PROFILE);
    expect(result.isDemo).toBe(true);
    expect(result.authoritative).toBe(false);
    expect(result.marker).toBe(DEMO_SEED_MARKER);

    const badges = await listActiveBadges(PROFILE);
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(badge.isDemo).toBe(true);
      expect(badge.metadata.demo).toBe(true);
      expect(badge.metadata.marker).toBe(DEMO_SEED_MARKER);
      expect(badge.metadata.authoritative).toBe(false);
    }
  });

  it('não concede itens VIP/exclusivos nem origens administrativas', async () => {
    const result = await seedDemoCollectibles(PROFILE);
    expect(result.badgeKeys).not.toContain('vip-supporter');
    expect(result.badgeKeys).not.toContain('founder');
    expect(result.frameKeys).not.toContain('vip');

    const badges = await listActiveBadges(PROFILE);
    const frames = await listActiveFrames(PROFILE);
    for (const record of [...badges, ...frames]) {
      expect(record.source).toBe('automatic');
      expect(record.source).not.toBe('manual');
      expect(record.source).not.toBe('system_test');
    }
  });

  it('é idempotente (não duplica posse ao semear novamente)', async () => {
    await seedDemoCollectibles(PROFILE);
    const firstBadges = await listActiveBadges(PROFILE);
    const firstFrames = await listActiveFrames(PROFILE);

    await seedDemoCollectibles(PROFILE);
    expect(await listActiveBadges(PROFILE)).toHaveLength(firstBadges.length);
    expect(await listActiveFrames(PROFILE)).toHaveLength(firstFrames.length);
  });

  it('não permite ao usuário alterar a própria posse nem elevar privilégios', async () => {
    await seedDemoCollectibles(PROFILE);
    const ctx = demoAuthorizationContext(PROFILE);

    // Não pode conceder a si mesmo item VIP (disponibilidade não-standard por via não admin).
    await expect(
      grantBadge(ctx, {
        profileTechnicalId: PROFILE,
        badgeKey: 'vip-supporter',
        source: 'automatic',
      }),
    ).rejects.toBeInstanceOf(CollectibleAuthorizationError);

    // Não pode conceder a si mesmo um item por origem administrativa.
    await expect(
      grantBadge(ctx, {
        profileTechnicalId: PROFILE,
        badgeKey: 'early-member',
        source: 'manual',
      }),
    ).rejects.toBeInstanceOf(CollectibleAuthorizationError);

    // Não pode revogar a própria posse.
    await expect(revokeBadge(ctx, PROFILE, 'early-member')).rejects.toBeInstanceOf(
      CollectibleAuthorizationError,
    );

    // Não pode conceder a outro perfil.
    await expect(
      grantBadge(ctx, {
        profileTechnicalId: 'prof_outro',
        badgeKey: 'early-member',
        source: 'automatic',
      }),
    ).rejects.toBeInstanceOf(CollectibleAuthorizationError);

    // A posse permanece intacta após as tentativas.
    expect(await getActiveBadge(PROFILE, 'early-member')).not.toBeNull();
  });

  it('permite equipar um item padrão que o perfil realmente possui', async () => {
    await seedDemoCollectibles(PROFILE);
    const equipped = await equipBadge(demoAuthorizationContext(PROFILE), PROFILE, 'early-member');
    expect(equipped.isEquipped).toBe(true);
  });

  it('mantém identificação de demonstração persistente e distinta de posse real', async () => {
    await seedDemoCollectibles(PROFILE);
    const demo = await getActiveBadge(PROFILE, 'early-member');
    expect(demo?.isDemo).toBe(true);
    expect(demo?.sourceRef).toBe(DEMO_SEED_MARKER);
    expect(demo?.authorityProof).toBeNull();
    // Fail-closed: o verificador padrão nunca reconhece autoridade em posse local.
    expect(
      denyAllOwnershipAuthority({
        profileTechnicalId: PROFILE,
        itemKey: 'early-member',
        source: demo!.source,
        revokedAt: demo!.revokedAt,
        isDemo: demo!.isDemo,
        authorityProof: demo!.authorityProof,
      }).authoritative,
    ).toBe(false);

    // Posse real por conquista: mesma origem não administrativa, porém isDemo=false.
    const real = await grantBadge(demoAuthorizationContext('prof_real'), {
      profileTechnicalId: 'prof_real',
      badgeKey: 'early-member',
      source: 'automatic',
    });
    expect(real.isDemo).toBe(false);
    expect(real.sourceRef).toBeNull();
    expect(real.authorityProof).toBeNull();
    expect(
      denyAllOwnershipAuthority({
        profileTechnicalId: 'prof_real',
        itemKey: 'early-member',
        source: real.source,
        revokedAt: real.revokedAt,
        isDemo: real.isDemo,
        authorityProof: real.authorityProof,
      }).authoritative,
    ).toBe(false);
  });

  it('nunca converte registros de demonstração em concessões reais', async () => {
    await seedDemoCollectibles(PROFILE);
    const before = await getActiveBadge(PROFILE, 'early-member');

    // Tentar "promover" a posse via concessão administrativa é recusado e não altera o registro.
    await expect(
      grantBadge(demoAuthorizationContext(PROFILE), {
        profileTechnicalId: PROFILE,
        badgeKey: 'early-member',
        source: 'manual',
      }),
    ).rejects.toBeInstanceOf(CollectibleAuthorizationError);

    const after = await getActiveBadge(PROFILE, 'early-member');
    expect(after?.id).toBe(before?.id);
    expect(after?.isDemo).toBe(true);
    expect(after?.source).toBe('automatic');
  });

  it('não cria posse exclusiva e nunca trata demonstração como concessão administrativa', async () => {
    await seedDemoCollectibles(PROFILE);
    expect(await getActiveBadge(PROFILE, 'founder')).toBeNull();

    // Ainda que existisse uma posse exclusiva marcada como demo, ela não autoriza equipar.
    expect(
      canEquipItem(
        demoAuthorizationContext(PROFILE),
        { itemType: 'badge', itemKey: 'founder', availability: 'exclusive' },
        {
          profileTechnicalId: PROFILE,
          itemKey: 'founder',
          source: 'automatic',
          revokedAt: null,
          isDemo: true,
          authorityProof: null,
        },
      ),
    ).toEqual({ allowed: false, reason: 'demo_not_authoritative' });
  });
});
