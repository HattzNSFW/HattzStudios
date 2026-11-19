/**
 * Auditoria estática da fronteira somente leitura do Control (B4.2).
 *
 * Complementa os testes de UI: aqui verificamos que o código do app não contém caminhos de escrita
 * administrativa, não depende de repositórios mutáveis, não abre canais de rede/storage e não cria
 * sessões administrativas locais. A varredura é RECURSIVA e cobre todos os arquivos de código do app.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AdminAuthorizationError,
  assertAdminSession,
  canAssignRole,
  canGrantBenefit,
  hasAdminSession,
  resolveContextBenefits,
  type AuthorizationContext,
  type RoleKey,
} from '@hattz/permissions';

const ROOT = process.cwd();
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

interface SourceFile {
  path: string;
  content: string;
}

function walkCode(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return walkCode(fullPath);
    if (entry.isFile() && CODE_EXTENSIONS.has(extname(entry.name))) return [fullPath];
    return [];
  });
}

function controlSources(): readonly SourceFile[] {
  return walkCode(resolve(ROOT, 'apps/control/src')).map((path) => ({
    path,
    content: readFileSync(path, 'utf8'),
  }));
}

describe('Control somente leitura — auditoria de fronteira', () => {
  it('varre arquivos de código recursivamente e não contém mutação, rede, storage ou sessão admin', () => {
    const sources = controlSources();
    expect(sources.length).toBeGreaterThanOrEqual(7);

    const forbiddenTokens = [
      'grantBadge',
      'grantFrame',
      'revokeBadge',
      'revokeFrame',
      'equipBadge',
      'equipFrame',
      'recordCollectionProgress',
      'getStudioDb',
      'Dexie',
      'dexie',
      'indexedDB',
      'openDB',
      'userBadges',
      'userFrames',
      'userCollectionProgress',
      'adminAccounts',
      'adminSession',
      'assertAdminSession',
      'createTrustedOwnershipAuthority',
      'ownershipProof',
      'seedDemoCollectibles',
      'publishWorkingDraft',
      'unpublishProfile',
      '@hattz/local-store',
      'XMLHttpRequest',
      'WebSocket',
      'localStorage',
      'sessionStorage',
      'fetch(',
    ];

    for (const { path, content } of sources) {
      for (const token of forbiddenTokens) {
        expect(content, `${path} contém o token proibido "${token}"`).not.toContain(token);
      }
      expect(content, `${path} usa import dinâmico`).not.toMatch(/\bimport\s*\(/);
      expect(content, `${path} usa require/eval`).not.toMatch(/\b(?:require|eval)\s*\(/);
      expect(content, `${path} importa módulo de escrita`).not.toMatch(
        /(?:from|import)\s*['"](?:@hattz\/local-store|dexie)/,
      );
    }
  });

  it('não declara dependência de repositórios locais mutáveis ou clientes remotos', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'apps/control/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const dependencies = Object.keys(pkg.dependencies ?? {});
    for (const forbidden of [
      '@hattz/local-store',
      'dexie',
      '@supabase/supabase-js',
      'axios',
      'node-fetch',
    ]) {
      expect(dependencies).not.toContain(forbidden);
    }
  });

  it('mantém a API pública do local-store restrita ao entry point', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(ROOT, 'packages/local-store/package.json'), 'utf8'),
    ) as { exports?: Record<string, string> };
    expect(Object.keys(pkg.exports ?? {})).toEqual(['.']);
  });

  it('preserva o schema local sem tabelas administrativas e a API pública sem admin session', () => {
    const db = readFileSync(resolve(ROOT, 'packages/local-store/src/db.ts'), 'utf8');
    expect(db).toContain('STUDIO_DB_VERSION = 4');
    expect(db).not.toContain('adminAccounts');
    expect(db).not.toContain('adminSession');

    const publicIndex = readFileSync(resolve(ROOT, 'packages/local-store/src/index.ts'), 'utf8');
    expect(publicIndex).not.toMatch(/admin/i);
  });

  it('mantém assertAdminSession fail-closed para todo cargo público sem sessão confiável', () => {
    const roles: readonly (RoleKey | null)[] = ['member', 'vip', 'creator', 'owner', null];
    for (const role of roles) {
      const ctx: AuthorizationContext = {
        role,
        profileTechnicalId: 'prof_sem_sessao',
        adminSession: null,
      };
      expect(hasAdminSession(ctx)).toBe(false);
      expect(() => assertAdminSession(ctx)).toThrow(AdminAuthorizationError);
    }
  });

  it('não concede autoridade administrativa ao cargo público Owner', () => {
    const ctx: AuthorizationContext = {
      role: 'owner',
      profileTechnicalId: 'prof_owner',
      adminSession: null,
    };

    expect(() => assertAdminSession(ctx)).toThrow(AdminAuthorizationError);
    expect(canGrantBenefit(ctx, 'admin.control_access').allowed).toBe(false);
    expect(canAssignRole(ctx, 'owner').allowed).toBe(false);
    expect(resolveContextBenefits(ctx)).not.toContain('admin.control_access');
  });
});
