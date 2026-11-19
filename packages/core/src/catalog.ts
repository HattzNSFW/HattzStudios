/**
 * Catálogo de definições (READ-ONLY) de badges, molduras, coleções e recompensas.
 *
 * Separação explícita de responsabilidades (B4.1):
 * 1. Definições do catálogo → este arquivo. Descrevem o que EXISTE, não o que alguém POSSUI.
 * 2. Dados fictícios de demonstração → `@hattz/local-store` (`demoSeed.ts`), marcados `isDemo`.
 * 3. Posse derivada de conquistas locais → repositories (`@hattz/local-store`).
 * 4. Futuras concessões administrativas → indisponíveis (exigem backend confiável).
 *
 * O catálogo é declarativo e não concede acesso: a autorização decide se um perfil pode adquirir
 * ou equipar um item, e a posse decide se ele o possui. Estar cadastrado aqui NÃO é posse.
 */

import type { BadgeDefinition, CollectionDefinition, FrameDefinition } from './collectibles';

/** Badges de produção conhecidos. Nenhum é atribuído automaticamente por este catálogo. */
export const BADGE_CATALOG: readonly BadgeDefinition[] = [
  {
    badgeKey: 'early-member',
    name: 'Membro Inicial',
    description: 'Concedido a quem participou das primeiras fases do Hättz.',
    category: 'profile',
    rarity: 'comum',
    availability: 'standard',
    isSpecial: false,
    isDemo: false,
  },
  {
    badgeKey: 'profile-pioneer',
    name: 'Pioneiro de Perfil',
    description: 'Concedido a perfis publicados durante a fundação.',
    category: 'profile',
    rarity: 'incomum',
    availability: 'standard',
    isSpecial: false,
    isDemo: false,
  },
  {
    badgeKey: 'vip-supporter',
    name: 'Apoiador VIP',
    description: 'Badge do nível VIP.',
    category: 'general',
    rarity: 'rara',
    availability: 'vip',
    isSpecial: false,
    isDemo: false,
  },
  {
    badgeKey: 'founder',
    name: 'Fundador',
    description: 'Badge exclusivo reservado à fundação.',
    category: 'general',
    rarity: 'especial',
    availability: 'exclusive',
    isSpecial: true,
    isDemo: false,
  },
];

/** Molduras de produção conhecidas. Nenhuma é atribuída automaticamente por este catálogo. */
export const FRAME_CATALOG: readonly FrameDefinition[] = [
  {
    frameKey: 'default',
    name: 'Moldura Padrão',
    description: 'Moldura padrão disponível para todos os perfis.',
    category: 'general',
    rarity: 'comum',
    permanence: 'permanent',
    availability: 'standard',
    isAnimated: false,
    isDemo: false,
  },
  {
    frameKey: 'vip',
    name: 'Moldura VIP',
    description: 'Moldura exclusiva do nível VIP.',
    category: 'general',
    rarity: 'rara',
    permanence: 'permanent',
    availability: 'vip',
    isAnimated: false,
    isDemo: false,
  },
];

/**
 * Coleções de produção conhecidas.
 *
 * Vazio nesta etapa: o sistema completo de progresso/recompensa de coleções pertence a uma
 * entrega posterior do Bloco 4. O tipo e os helpers existem para não reescrever o sistema depois.
 */
export const COLLECTION_CATALOG: readonly CollectionDefinition[] = [];

export function findBadgeDefinition(badgeKey: string): BadgeDefinition | null {
  return BADGE_CATALOG.find((badge) => badge.badgeKey === badgeKey) ?? null;
}

export function findFrameDefinition(frameKey: string): FrameDefinition | null {
  return FRAME_CATALOG.find((frame) => frame.frameKey === frameKey) ?? null;
}

export function findCollectionDefinition(collectionKey: string): CollectionDefinition | null {
  return (
    COLLECTION_CATALOG.find((collection) => collection.collectionKey === collectionKey) ?? null
  );
}

/** Disponibilidade declarada de um badge no catálogo, ou `null` se desconhecido. */
export function badgeAvailability(badgeKey: string): BadgeDefinition['availability'] | null {
  return findBadgeDefinition(badgeKey)?.availability ?? null;
}

/** Disponibilidade declarada de uma moldura no catálogo, ou `null` se desconhecida. */
export function frameAvailability(frameKey: string): FrameDefinition['availability'] | null {
  return findFrameDefinition(frameKey)?.availability ?? null;
}
