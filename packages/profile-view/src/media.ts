/**
 * Resolve a URL de mídia pública a partir de um `assetId` do snapshot.
 *
 * A view pública de mídia (`v_share_public_media`) expõe apenas metadados (sem paths/buckets).
 * A estratégia de URL pública do Supabase ainda é decisão pendente; cada host (Share local, Studio
 * local) fornece sua própria implementação deste boundary.
 */
export interface ShareMediaResolver {
  resolveMediaUrl(assetId: string): string | null;
}
