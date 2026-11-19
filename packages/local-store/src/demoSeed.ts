/**
 * Seed de demonstração READ-ONLY (dados fictícios).
 *
 * Autorizado explicitamente pelo Owner como demonstração. Regras:
 * - Dados fictícios e marcados (`isDemo: true`, `metadata.demo = true`, marcador).
 * - Somente leitura do ponto de vista do usuário: nenhuma mutação administrativa é liberada.
 * - NÃO simula concessões administrativas reais: usa origem não administrativa (`automatic`) e
 *   apenas itens de disponibilidade `standard` (nunca VIP/exclusivo).
 * - NÃO concede cargos privados nem benefícios administrativos.
 * - NUNCA carrega evidência de autoridade (`authorityProof`): é posse local, sempre não
 *   autoritativa, e jamais satisfaz a verificação exigida para equipar itens Exclusivos.
 * - NÃO é fonte autoritativa de autorização e não deve ser confundido com produção.
 *
 * Separação (B4.1): (1) definições do catálogo em `@hattz/core/catalog`; (2) estes dados fictícios;
 * (3) posse derivada de conquistas locais; (4) futuras concessões administrativas (indisponíveis).
 */

import { BADGE_CATALOG, FRAME_CATALOG } from '@hattz/core';
import type { AuthorizationContext } from '@hattz/permissions';
import {
  getActiveBadge,
  getActiveFrame,
  grantBadge,
  grantFrame,
  type GrantBadgeInput,
  type GrantFrameInput,
} from './collectibles';

export const DEMO_SEED_MARKER = 'hattz-demo-seed-v1';

export interface DemoSeedResult {
  marker: string;
  isDemo: true;
  authoritative: false;
  badgeKeys: readonly string[];
  frameKeys: readonly string[];
}

/** Contexto de demonstração: sem sessão administrativa, cargo público padrão. */
export function demoAuthorizationContext(profileTechnicalId: string): AuthorizationContext {
  return { role: 'member', profileTechnicalId, adminSession: null };
}

/**
 * Semeia itens fictícios `standard` para um perfil. Idempotente: itens já possuídos são ignorados.
 * Não grava cargos, benefícios administrativos nem itens VIP/exclusivos.
 */
export async function seedDemoCollectibles(profileTechnicalId: string): Promise<DemoSeedResult> {
  if (typeof profileTechnicalId !== 'string' || profileTechnicalId.trim() === '') {
    throw new Error('profileTechnicalId é obrigatório para o seed de demonstração.');
  }
  const ctx = demoAuthorizationContext(profileTechnicalId);
  const badgeKeys: string[] = [];
  const frameKeys: string[] = [];

  for (const badge of BADGE_CATALOG) {
    if (badge.availability !== 'standard') continue;
    const existing = await getActiveBadge(profileTechnicalId, badge.badgeKey);
    if (existing) {
      badgeKeys.push(badge.badgeKey);
      continue;
    }
    const input: GrantBadgeInput = {
      profileTechnicalId,
      badgeKey: badge.badgeKey,
      source: 'automatic',
      sourceRef: DEMO_SEED_MARKER,
      isDemo: true,
      metadata: { demo: true, marker: DEMO_SEED_MARKER, authoritative: false },
    };
    await grantBadge(ctx, input);
    badgeKeys.push(badge.badgeKey);
  }

  for (const frame of FRAME_CATALOG) {
    if (frame.availability !== 'standard') continue;
    const existing = await getActiveFrame(profileTechnicalId, frame.frameKey);
    if (existing) {
      frameKeys.push(frame.frameKey);
      continue;
    }
    const input: GrantFrameInput = {
      profileTechnicalId,
      frameKey: frame.frameKey,
      source: 'automatic',
      sourceRef: DEMO_SEED_MARKER,
      isDemo: true,
      metadata: { demo: true, marker: DEMO_SEED_MARKER, authoritative: false },
    };
    await grantFrame(ctx, input);
    frameKeys.push(frame.frameKey);
  }

  return {
    marker: DEMO_SEED_MARKER,
    isDemo: true,
    authoritative: false,
    badgeKeys,
    frameKeys,
  };
}
