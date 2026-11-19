import Dexie, { type Table } from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTrustedOwnershipAuthority } from '@hattz/local-store/testing';
import {
  CollectibleAuthorizationError,
  CollectibleValidationError,
  DuplicateActiveOwnershipError,
  ItemNotOwnedError,
  STUDIO_DB_VERSION,
  StudioDatabase,
  closeStudioDb,
  equipBadge,
  equipFrame,
  getActiveBadge,
  getCollectionProgress,
  getStudioDb,
  grantBadge,
  grantFrame,
  listActiveBadges,
  recordCollectionProgress,
  revokeBadge,
  type DraftSnapshotRecord,
  type LocalProfileRecord,
  type LocalPublicationRecord,
  type MediaAssetRecord,
  type PendingSyncOperationRecord,
  type StudioMetaRecord,
  type WorkingDraftRecord,
} from '@hattz/local-store';

/** Banco mínimo v3, para exercitar o upgrade real v3 -> v4 preservando dados. */
class V3Database extends Dexie {
  localProfiles!: Table<LocalProfileRecord, string>;
  draftSnapshots!: Table<DraftSnapshotRecord, string>;
  pendingSyncOps!: Table<PendingSyncOperationRecord, string>;
  studioMeta!: Table<StudioMetaRecord, string>;
  workingDrafts!: Table<WorkingDraftRecord, string>;
  mediaAssets!: Table<MediaAssetRecord, string>;
  publications!: Table<LocalPublicationRecord, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      localProfiles: 'technicalId, publicSlugDraft, updatedAt, isDeleted',
      draftSnapshots: 'id, profileTechnicalId, version, createdAt, source',
      pendingSyncOps: 'operationId, profileTechnicalId, state, type, updatedAt',
      studioMeta: 'key, updatedAt',
    });
    this.version(2).stores({
      localProfiles: 'technicalId, publicSlugDraft, updatedAt, isDeleted',
      draftSnapshots: 'id, profileTechnicalId, version, createdAt, source',
      pendingSyncOps: 'operationId, profileTechnicalId, state, type, updatedAt',
      studioMeta: 'key, updatedAt',
      workingDrafts: 'profileTechnicalId, updatedAt',
      mediaAssets: 'assetId, profileTechnicalId, kind, createdAt',
    });
    this.version(3).stores({
      localProfiles: 'technicalId, publicSlugDraft, updatedAt, isDeleted',
      draftSnapshots: 'id, profileTechnicalId, version, createdAt, source',
      pendingSyncOps: 'operationId, profileTechnicalId, state, type, updatedAt',
      studioMeta: 'key, updatedAt',
      workingDrafts: 'profileTechnicalId, updatedAt',
      mediaAssets: 'assetId, profileTechnicalId, kind, createdAt',
      publications:
        'publicationId, profileTechnicalId, version, state, [profileTechnicalId+state], createdAt',
    });
  }
}

const upgradeDbName = () =>
  `hattz_collectibles_upgrade_${Date.now()}_${Math.random().toString(36).slice(2)}`;

async function resetSingleton(): Promise<void> {
  try {
    await getStudioDb().delete();
  } finally {
    await closeStudioDb();
  }
}

function ctx(profileTechnicalId: string) {
  return { role: 'member' as const, profileTechnicalId, adminSession: null };
}

describe('Dexie v3 -> v4 (aditivo, preserva dados)', () => {
  const dbs: StudioDatabase[] = [];
  const names: string[] = [];

  afterEach(async () => {
    for (const name of names.splice(0)) {
      try {
        await Dexie.delete(name);
      } catch {
        // ignore
      }
    }
    for (const db of dbs.splice(0)) {
      db.close();
      await db.delete();
    }
  });

  it('adiciona tabelas de colecionáveis sem perder perfis, snapshots nem publicações', async () => {
    const name = upgradeDbName();
    names.push(name);
    const now = Date.now();

    const v3 = new V3Database(name);
    await v3.open();
    await v3.localProfiles.put({
      technicalId: 'prof_v3',
      displayName: 'V3',
      publicSlugDraft: 'v3',
      visibility: 'unpublished',
      schemaVersion: 1,
      contentVersion: 2,
      createdAt: now,
      updatedAt: now,
      lastPublishedVersion: 1,
      isDeleted: false,
    });
    await v3.draftSnapshots.put({
      id: 'snap_v3',
      profileTechnicalId: 'prof_v3',
      version: 2,
      label: 'manual-2',
      content: { profile: { displayName: 'V3' } },
      createdAt: now,
      source: 'manual',
    });
    await v3.publications.put({
      publicationId: 'pub_v3',
      profileTechnicalId: 'prof_v3',
      version: 1,
      slug: 'v3',
      state: 'published',
      content: { profile: { displayName: 'Publicado' } },
      publishedAt: now,
      unpublishedAt: null,
      createdAt: now,
    });
    v3.close();

    const upgraded = new StudioDatabase(name);
    dbs.push(upgraded);
    await upgraded.open();
    expect(upgraded.verno).toBe(STUDIO_DB_VERSION);

    // Dados anteriores preservados.
    expect((await upgraded.localProfiles.get('prof_v3'))?.displayName).toBe('V3');
    expect(await upgraded.draftSnapshots.count()).toBe(1);
    expect(await upgraded.publications.count()).toBe(1);
    const publication = await upgraded.publications.get('pub_v3');
    expect(publication?.state).toBe('published');
    expect(publication?.content).toEqual({ profile: { displayName: 'Publicado' } });

    // Novas tabelas existem e começam vazias.
    expect(await upgraded.userBadges.count()).toBe(0);
    expect(await upgraded.userFrames.count()).toBe(0);
    expect(await upgraded.userCollectionProgress.count()).toBe(0);
  });
});

describe('repositório de colecionáveis: isolamento e proteções', () => {
  beforeEach(resetSingleton);
  afterEach(resetSingleton);

  it('impede posse ativa duplicada do mesmo badge (espelha ux_user_badges_active_unique)', async () => {
    const authorization = ctx('prof_dup');
    await grantBadge(authorization, {
      profileTechnicalId: 'prof_dup',
      badgeKey: 'early-member',
      source: 'automatic',
    });
    await expect(
      grantBadge(authorization, {
        profileTechnicalId: 'prof_dup',
        badgeKey: 'early-member',
        source: 'automatic',
      }),
    ).rejects.toBeInstanceOf(DuplicateActiveOwnershipError);
  });

  it('preserva isolamento entre perfis', async () => {
    await grantBadge(ctx('prof_a'), {
      profileTechnicalId: 'prof_a',
      badgeKey: 'early-member',
      source: 'automatic',
    });
    expect(await listActiveBadges('prof_b')).toHaveLength(0);
    expect(await getActiveBadge('prof_b', 'early-member')).toBeNull();
    expect(await getActiveBadge('prof_a', 'early-member')).not.toBeNull();
  });

  it('recusa mutações administrativas sem contexto autorizado', async () => {
    const authorization = ctx('prof_admin');
    await expect(
      grantBadge(authorization, {
        profileTechnicalId: 'prof_admin',
        badgeKey: 'early-member',
        source: 'manual',
      }),
    ).rejects.toBeInstanceOf(CollectibleAuthorizationError);
    await expect(
      grantFrame(authorization, {
        profileTechnicalId: 'prof_admin',
        frameKey: 'default',
        source: 'system_test',
      }),
    ).rejects.toBeInstanceOf(CollectibleAuthorizationError);
    await expect(revokeBadge(authorization, 'prof_admin', 'early-member')).rejects.toBeInstanceOf(
      CollectibleAuthorizationError,
    );
  });

  it('recusa equipar item não possuído', async () => {
    await expect(equipBadge(ctx('prof_x'), 'prof_x', 'early-member')).rejects.toBeInstanceOf(
      ItemNotOwnedError,
    );
  });

  it('equipa badge/moldura possuídos e valida catálogo', async () => {
    const authorization = ctx('prof_ok');
    await grantBadge(authorization, {
      profileTechnicalId: 'prof_ok',
      badgeKey: 'early-member',
      source: 'automatic',
    });
    await grantFrame(authorization, {
      profileTechnicalId: 'prof_ok',
      frameKey: 'default',
      source: 'automatic',
    });
    expect((await equipBadge(authorization, 'prof_ok', 'early-member')).isEquipped).toBe(true);
    expect((await equipFrame(authorization, 'prof_ok', 'default')).isEquipped).toBe(true);

    await expect(
      grantBadge(authorization, {
        profileTechnicalId: 'prof_ok',
        badgeKey: 'inexistente',
        source: 'automatic',
      }),
    ).rejects.toBeInstanceOf(CollectibleValidationError);
  });

  it('mantém progresso de coleção isolado por perfil', async () => {
    await recordCollectionProgress({
      profileTechnicalId: 'prof_p1',
      collectionKey: 'demo-set',
      status: 'in_progress',
    });
    expect(await getCollectionProgress('prof_p1', 'demo-set')).not.toBeNull();
    expect(await getCollectionProgress('prof_p2', 'demo-set')).toBeNull();
  });

  it('recusa equipar Exclusivo forjado localmente (source manual, sem fonte confiável)', async () => {
    // Um usuário pode escrever isto direto no IndexedDB. NÃO é concessão administrativa.
    const db = getStudioDb();
    await db.open();
    await db.userBadges.put({
      id: 'ubadge_forged_founder',
      profileTechnicalId: 'prof_forged',
      badgeKey: 'founder',
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
    });

    await expect(equipBadge(ctx('prof_forged'), 'prof_forged', 'founder')).rejects.toBeInstanceOf(
      CollectibleAuthorizationError,
    );
  });

  it('equipa Exclusivo apenas com autoridade confiável (fonte confiável simulada)', async () => {
    const db = getStudioDb();
    await db.open();
    await db.userBadges.put({
      id: 'ubadge_trusted_founder',
      profileTechnicalId: 'prof_trusted',
      badgeKey: 'founder',
      source: 'manual',
      sourceRef: null,
      grantedAt: Date.now(),
      revokedAt: null,
      revokeReason: null,
      isEquipped: false,
      isFavorite: false,
      sortOrder: null,
      isDemo: false,
      authorityProof: 'simulated-trusted-proof',
      metadata: {},
    });

    // Sem autoridade (produção local): recusado.
    await expect(equipBadge(ctx('prof_trusted'), 'prof_trusted', 'founder')).rejects.toBeInstanceOf(
      CollectibleAuthorizationError,
    );

    // Com autoridade confiável simulada (fábrica interna): equipado.
    const equipped = await equipBadge(ctx('prof_trusted'), 'prof_trusted', 'founder', {
      authority: createTrustedOwnershipAuthority((ownership) =>
        ownership.authorityProof === 'simulated-trusted-proof'
          ? { authoritative: true, reason: null }
          : { authoritative: false, reason: 'no_trusted_authority' },
      ),
    });
    expect(equipped.isEquipped).toBe(true);
  });

  it('recusa equipar item Exclusivo cuja posse é apenas de demonstração', async () => {
    const db = getStudioDb();
    await db.open();
    await db.userBadges.put({
      id: 'ubadge_demo_founder',
      profileTechnicalId: 'prof_demo_x',
      badgeKey: 'founder',
      source: 'automatic',
      sourceRef: 'hattz-demo-seed-v1',
      grantedAt: Date.now(),
      revokedAt: null,
      revokeReason: null,
      isEquipped: false,
      isFavorite: false,
      sortOrder: null,
      isDemo: true,
      authorityProof: null,
      metadata: {},
    });

    await expect(equipBadge(ctx('prof_demo_x'), 'prof_demo_x', 'founder')).rejects.toBeInstanceOf(
      CollectibleAuthorizationError,
    );
  });
});
