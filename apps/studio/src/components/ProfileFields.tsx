import type { MediaAssetKind, MediaAssetRecord } from '../persistence';
import { withProfile, withSeo, type StudioDraft } from '../editor';
import { FileButton, TextArea, TextInput } from './fields';
import type { StudioMediaState } from '../hooks/useStudioMedia';

interface ProfileFieldsProps {
  draft: StudioDraft;
  media: StudioMediaState;
  disabled: boolean;
  onUpdate: (updater: (draft: StudioDraft) => StudioDraft) => void;
  onUpload: (kind: MediaAssetKind, file: File) => Promise<MediaAssetRecord | null>;
}

export function ProfileFields({ draft, media, disabled, onUpdate, onUpload }: ProfileFieldsProps) {
  const avatarUrl = draft.profile.avatarAssetId
    ? media.resolver.resolveMediaUrl(draft.profile.avatarAssetId)
    : null;
  const bannerUrl = draft.profile.bannerAssetId
    ? media.resolver.resolveMediaUrl(draft.profile.bannerAssetId)
    : null;

  const handleUpload = async (kind: MediaAssetKind, file: File) => {
    const asset = await onUpload(kind, file);
    if (!asset) return;
    onUpdate((current) =>
      kind === 'avatar'
        ? withProfile(current, { avatarAssetId: asset.assetId })
        : withProfile(current, { bannerAssetId: asset.assetId }),
    );
  };

  return (
    <div className="studio-panel">
      <h2 className="studio-panel__title">Perfil</h2>

      <TextInput
        id="studio-display-name"
        label="Nome de exibição"
        value={draft.profile.displayName}
        maxLength={80}
        disabled={disabled}
        placeholder="Seu nome"
        onChange={(value) => onUpdate((current) => withProfile(current, { displayName: value }))}
      />

      <TextArea
        id="studio-bio"
        label="Bio"
        value={draft.profile.bio}
        rows={4}
        maxLength={400}
        disabled={disabled}
        placeholder="Fale um pouco sobre você"
        onChange={(value) => onUpdate((current) => withProfile(current, { bio: value }))}
      />

      <fieldset className="studio-fieldset" disabled={disabled}>
        <legend className="studio-panel__subtitle">SEO e metadados</legend>
        <TextInput
          id="studio-seo-title"
          label="Título para mecanismos de busca"
          value={draft.seo.title}
          maxLength={120}
          disabled={disabled}
          placeholder="Título exibido na aba do navegador e em buscas"
          onChange={(value) => onUpdate((current) => withSeo(current, { title: value }))}
        />
        <TextArea
          id="studio-seo-description"
          label="Descrição para mecanismos de busca"
          value={draft.seo.description}
          rows={3}
          maxLength={300}
          disabled={disabled}
          placeholder="Resumo exibido em resultados e compartilhamentos"
          onChange={(value) => onUpdate((current) => withSeo(current, { description: value }))}
        />
        <p className="studio-help">
          O endereço público (/slug) é configurado na aba Dados. Publicar é necessário para que
          estas informações apareçam no Share.
        </p>
      </fieldset>

      <div className="studio-media-row">
        <div className="studio-media-preview">
          {avatarUrl ? (
            <img className="studio-media-preview__avatar" src={avatarUrl} alt="Prévia do avatar" />
          ) : (
            <span className="studio-media-preview__placeholder" aria-hidden="true">
              Avatar
            </span>
          )}
        </div>
        <div className="studio-media-actions">
          <p className="studio-field__label">Avatar</p>
          <FileButton
            label="Enviar avatar"
            accept="image/*"
            disabled={disabled}
            onFile={(file) => void handleUpload('avatar', file)}
          />
          {draft.profile.avatarAssetId ? (
            <button
              type="button"
              className="studio-mini-button"
              disabled={disabled}
              onClick={() => onUpdate((current) => withProfile(current, { avatarAssetId: null }))}
            >
              Remover
            </button>
          ) : null}
        </div>
      </div>

      <div className="studio-media-row">
        <div className="studio-media-preview">
          {bannerUrl ? (
            <img className="studio-media-preview__banner" src={bannerUrl} alt="Prévia do banner" />
          ) : (
            <span className="studio-media-preview__placeholder" aria-hidden="true">
              Banner
            </span>
          )}
        </div>
        <div className="studio-media-actions">
          <p className="studio-field__label">Banner</p>
          <FileButton
            label="Enviar banner"
            accept="image/*"
            disabled={disabled}
            onFile={(file) => void handleUpload('banner', file)}
          />
          {draft.profile.bannerAssetId ? (
            <button
              type="button"
              className="studio-mini-button"
              disabled={disabled}
              onClick={() => onUpdate((current) => withProfile(current, { bannerAssetId: null }))}
            >
              Remover
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
