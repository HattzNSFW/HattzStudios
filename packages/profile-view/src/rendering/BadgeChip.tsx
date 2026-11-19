import { COLLECTIBLE_RARITIES, type CollectibleRarity } from '@hattz/core';

const RARITY_SET = new Set<string>(COLLECTIBLE_RARITIES);

const RARITY_LABELS: Record<CollectibleRarity, string> = {
  comum: 'Comum',
  incomum: 'Incomum',
  rara: 'Rara',
  epica: 'Épica',
  lendaria: 'Lendária',
  mitica: 'Mítica',
  especial: 'Especial',
};

interface BadgeChipProps {
  name: string;
  rarity: string | null;
  description: string | null;
}

/** Selo público com raridade; a raridade é normalizada ao conjunto aprovado. */
export function BadgeChip({ name, rarity, description }: BadgeChipProps) {
  const known = rarity && RARITY_SET.has(rarity) ? (rarity as CollectibleRarity) : null;
  return (
    <li className={`share-badge${known ? ` share-badge--${known}` : ''}`}>
      <span className="share-badge__name">{name}</span>
      {known ? <span className="share-badge__rarity">{RARITY_LABELS[known]}</span> : null}
      {description ? <span className="share-badge__desc">{description}</span> : null}
    </li>
  );
}
