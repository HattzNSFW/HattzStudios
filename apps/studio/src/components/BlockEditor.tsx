import type { MediaAssetKind, MediaAssetRecord } from '../persistence';
import {
  updateBlockProps,
  type StudioBlock,
  type StudioDraft,
  type StudioSection,
} from '../editor';
import { RARITY_OPTIONS } from '../editor/blocks';
import { FileButton, SelectInput, TextArea, TextInput } from './fields';
import type { StudioMediaState } from '../hooks/useStudioMedia';

const RARITY_LABELS: Record<string, string> = {
  comum: 'Comum',
  incomum: 'Incomum',
  rara: 'Rara',
  epica: 'Épica',
  lendaria: 'Lendária',
  mitica: 'Mítica',
  especial: 'Especial',
};

const RARITY_SELECT = RARITY_OPTIONS.map((rarity) => ({
  value: rarity,
  label: RARITY_LABELS[rarity] ?? rarity,
}));

interface BlockEditorProps {
  section: StudioSection;
  block: StudioBlock;
  media: StudioMediaState;
  disabled: boolean;
  onUpdate: (updater: (draft: StudioDraft) => StudioDraft) => void;
  onUpload: (kind: MediaAssetKind, file: File) => Promise<MediaAssetRecord | null>;
  onClose: () => void;
}

export function BlockEditor({
  section,
  block,
  media,
  disabled,
  onUpdate,
  onUpload,
  onClose,
}: BlockEditorProps) {
  const props = block.props;
  const str = (key: string): string =>
    typeof props[key] === 'string' ? (props[key] as string) : '';
  const setProp = (patch: Record<string, unknown>) =>
    onUpdate((current) => updateBlockProps(current, section.id, block.id, patch));

  const items = Array.isArray(props.items) ? (props.items as Array<Record<string, unknown>>) : [];
  const setItems = (next: Array<Record<string, unknown>>) => setProp({ items: next });

  const uploadAsset = async (kind: MediaAssetKind, file: File, key: string) => {
    const asset = await onUpload(kind, file);
    if (asset) setProp({ [key]: asset.assetId });
  };

  return (
    <div className="studio-panel studio-properties">
      <div className="studio-panel__head">
        <h2 className="studio-panel__title">Propriedades</h2>
        <button type="button" className="studio-mini-button" onClick={onClose}>
          Fechar
        </button>
      </div>

      {block.type === 'heading' ? (
        <>
          <TextInput
            id="block-heading-text"
            label="Texto"
            value={str('text')}
            disabled={disabled}
            onChange={(value) => setProp({ text: value })}
          />
          <SelectInput
            id="block-heading-level"
            label="Nível"
            value={props.level === 3 ? '3' : '2'}
            options={[
              { value: '2', label: 'Título (h2)' },
              { value: '3', label: 'Subtítulo (h3)' },
            ]}
            disabled={disabled}
            onChange={(value) => setProp({ level: Number(value) })}
          />
        </>
      ) : null}

      {block.type === 'text' ? (
        <TextArea
          id="block-text-text"
          label="Texto"
          value={str('text')}
          rows={5}
          disabled={disabled}
          onChange={(value) => setProp({ text: value })}
        />
      ) : null}

      {block.type === 'link' ? (
        <>
          <TextInput
            id="block-link-label"
            label="Rótulo"
            value={str('label')}
            disabled={disabled}
            onChange={(value) => setProp({ label: value })}
          />
          <TextInput
            id="block-link-url"
            label="URL (https://)"
            value={str('url')}
            disabled={disabled}
            onChange={(value) => setProp({ url: value })}
          />
          <TextInput
            id="block-link-description"
            label="Descrição"
            value={str('description')}
            disabled={disabled}
            onChange={(value) => setProp({ description: value })}
          />
        </>
      ) : null}

      {block.type === 'links' ? (
        <div className="studio-items">
          {items.map((item, index) => (
            <div className="studio-item" key={index}>
              <TextInput
                id={`block-links-label-${index}`}
                label={`Rótulo ${index + 1}`}
                value={typeof item.label === 'string' ? item.label : ''}
                disabled={disabled}
                onChange={(value) =>
                  setItems(items.map((it, i) => (i === index ? { ...it, label: value } : it)))
                }
              />
              <TextInput
                id={`block-links-url-${index}`}
                label={`URL ${index + 1}`}
                value={typeof item.url === 'string' ? item.url : ''}
                disabled={disabled}
                onChange={(value) =>
                  setItems(items.map((it, i) => (i === index ? { ...it, url: value } : it)))
                }
              />
              <button
                type="button"
                className="studio-mini-button studio-mini-button--danger"
                disabled={disabled}
                onClick={() => setItems(items.filter((_, i) => i !== index))}
              >
                Remover link
              </button>
            </div>
          ))}
          <button
            type="button"
            className="studio-button studio-button--small"
            disabled={disabled}
            onClick={() => setItems([...items, { label: 'Novo link', url: 'https://' }])}
          >
            Adicionar link
          </button>
        </div>
      ) : null}

      {block.type === 'image' ? (
        <>
          <div className="studio-asset-row">
            {str('assetId') ? (
              <img
                className="studio-asset-preview"
                src={media.resolver.resolveMediaUrl(str('assetId')) ?? undefined}
                alt="Prévia da imagem"
              />
            ) : (
              <span className="studio-media-preview__placeholder">Sem imagem</span>
            )}
            <div className="studio-media-actions">
              <FileButton
                label="Enviar imagem"
                accept="image/*"
                disabled={disabled}
                onFile={(file) => void uploadAsset('image', file, 'assetId')}
              />
              {str('assetId') ? (
                <button
                  type="button"
                  className="studio-mini-button"
                  disabled={disabled}
                  onClick={() => setProp({ assetId: '' })}
                >
                  Remover
                </button>
              ) : null}
            </div>
          </div>
          <TextInput
            id="block-image-alt"
            label="Texto alternativo"
            value={str('alt')}
            disabled={disabled}
            onChange={(value) => setProp({ alt: value })}
          />
          <TextInput
            id="block-image-caption"
            label="Legenda"
            value={str('caption')}
            disabled={disabled}
            onChange={(value) => setProp({ caption: value })}
          />
        </>
      ) : null}

      {block.type === 'badges' ? (
        <div className="studio-items">
          <TextInput
            id="block-badges-title"
            label="Título"
            value={str('title')}
            disabled={disabled}
            onChange={(value) => setProp({ title: value })}
          />
          {items.map((item, index) => (
            <div className="studio-item" key={index}>
              <TextInput
                id={`block-badges-name-${index}`}
                label={`Nome ${index + 1}`}
                value={typeof item.name === 'string' ? item.name : ''}
                disabled={disabled}
                onChange={(value) =>
                  setItems(items.map((it, i) => (i === index ? { ...it, name: value } : it)))
                }
              />
              <SelectInput
                id={`block-badges-rarity-${index}`}
                label={`Raridade ${index + 1}`}
                value={typeof item.rarity === 'string' ? item.rarity : 'comum'}
                options={RARITY_SELECT}
                disabled={disabled}
                onChange={(value) =>
                  setItems(items.map((it, i) => (i === index ? { ...it, rarity: value } : it)))
                }
              />
              <button
                type="button"
                className="studio-mini-button studio-mini-button--danger"
                disabled={disabled}
                onClick={() => setItems(items.filter((_, i) => i !== index))}
              >
                Remover selo
              </button>
            </div>
          ))}
          <button
            type="button"
            className="studio-button studio-button--small"
            disabled={disabled}
            onClick={() => setItems([...items, { name: 'Novo selo', rarity: 'comum' }])}
          >
            Adicionar selo
          </button>
        </div>
      ) : null}

      {block.type === 'music' ? (
        <>
          <TextInput
            id="block-music-title"
            label="Título"
            value={str('title')}
            disabled={disabled}
            onChange={(value) => setProp({ title: value })}
          />
          <TextInput
            id="block-music-artist"
            label="Artista"
            value={str('artist')}
            disabled={disabled}
            onChange={(value) => setProp({ artist: value })}
          />
          <div className="studio-asset-row">
            <span className="studio-field__label">Áudio</span>
            <div className="studio-media-actions">
              <FileButton
                label={str('assetId') ? 'Trocar áudio' : 'Enviar áudio'}
                accept="audio/*"
                disabled={disabled}
                onFile={(file) => void uploadAsset('audio', file, 'assetId')}
              />
              {str('assetId') ? (
                <button
                  type="button"
                  className="studio-mini-button"
                  disabled={disabled}
                  onClick={() => setProp({ assetId: '' })}
                >
                  Remover
                </button>
              ) : null}
            </div>
          </div>
          <div className="studio-asset-row">
            <span className="studio-field__label">Capa</span>
            <div className="studio-media-actions">
              <FileButton
                label={str('coverAssetId') ? 'Trocar capa' : 'Enviar capa'}
                accept="image/*"
                disabled={disabled}
                onFile={(file) => void uploadAsset('cover', file, 'coverAssetId')}
              />
              {str('coverAssetId') ? (
                <button
                  type="button"
                  className="studio-mini-button"
                  disabled={disabled}
                  onClick={() => setProp({ coverAssetId: '' })}
                >
                  Remover
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {block.type === 'divider' ? (
        <p className="studio-empty">O divisor não tem propriedades.</p>
      ) : null}
    </div>
  );
}
