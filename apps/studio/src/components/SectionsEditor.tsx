import { useState } from 'react';
import {
  addBlock,
  addSection,
  moveBlock,
  moveSection,
  removeBlock,
  removeSection,
  withBlock,
  withSection,
  type StudioBlock,
  type StudioDraft,
} from '../editor';
import {
  BLOCK_TYPE_LABELS,
  BLOCK_TYPES,
  SECTION_TYPES,
  type StudioBlockType,
} from '../editor/blocks';
import type { SelectedBlock } from './types';

interface SectionsEditorProps {
  draft: StudioDraft;
  selected: SelectedBlock | null;
  disabled: boolean;
  onSelect: (selected: SelectedBlock | null) => void;
  onUpdate: (updater: (draft: StudioDraft) => StudioDraft) => void;
}

function blockSummary(block: StudioBlock): string {
  const props = block.props;
  switch (block.type) {
    case 'heading':
    case 'text':
      return typeof props.text === 'string' && props.text.trim() !== '' ? props.text : 'Vazio';
    case 'link':
      return typeof props.label === 'string' && props.label.trim() !== '' ? props.label : 'Link';
    case 'links': {
      const count = Array.isArray(props.items) ? props.items.length : 0;
      return `${count} ${count === 1 ? 'link' : 'links'}`;
    }
    case 'image':
      return typeof props.caption === 'string' && props.caption.trim() !== ''
        ? props.caption
        : 'Imagem';
    case 'badges':
      return typeof props.title === 'string' && props.title.trim() !== '' ? props.title : 'Selos';
    case 'music':
      return typeof props.title === 'string' && props.title.trim() !== '' ? props.title : 'Música';
    case 'divider':
      return 'Linha separadora';
  }
}

export function SectionsEditor({
  draft,
  selected,
  disabled,
  onSelect,
  onUpdate,
}: SectionsEditorProps) {
  const [newSectionType, setNewSectionType] = useState<string>('content');

  return (
    <div className="studio-panel">
      <div className="studio-panel__head">
        <h2 className="studio-panel__title">Seções</h2>
        <div className="studio-inline-add">
          <select
            className="studio-input studio-input--compact"
            aria-label="Tipo da nova seção"
            value={newSectionType}
            disabled={disabled}
            onChange={(event) => setNewSectionType(event.target.value)}
          >
            {SECTION_TYPES.map((section) => (
              <option key={section.type} value={section.type}>
                {section.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="studio-button"
            disabled={disabled}
            onClick={() => onUpdate((current) => addSection(current, newSectionType))}
          >
            Adicionar seção
          </button>
        </div>
      </div>

      {draft.sections.length === 0 ? (
        <p className="studio-empty">Nenhuma seção ainda. Adicione a primeira para começar.</p>
      ) : null}

      <ul className="studio-section-list">
        {draft.sections.map((section, sectionIndex) => (
          <li key={section.id} className="studio-section">
            <div className="studio-section__head">
              <select
                className="studio-input studio-input--compact"
                aria-label="Tipo da seção"
                value={section.type}
                disabled={disabled}
                onChange={(event) =>
                  onUpdate((current) =>
                    withSection(current, section.id, { type: event.target.value }),
                  )
                }
              >
                {SECTION_TYPES.map((type) => (
                  <option key={type.type} value={type.type}>
                    {type.label}
                  </option>
                ))}
              </select>

              <div className="studio-section__actions">
                <button
                  type="button"
                  className="studio-icon-button"
                  aria-label="Mover seção para cima"
                  disabled={disabled || sectionIndex === 0}
                  onClick={() => onUpdate((current) => moveSection(current, section.id, -1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="studio-icon-button"
                  aria-label="Mover seção para baixo"
                  disabled={disabled || sectionIndex === draft.sections.length - 1}
                  onClick={() => onUpdate((current) => moveSection(current, section.id, 1))}
                >
                  ↓
                </button>
                <label className="studio-toggle studio-toggle--compact">
                  <input
                    type="checkbox"
                    checked={section.visible}
                    disabled={disabled}
                    onChange={(event) =>
                      onUpdate((current) =>
                        withSection(current, section.id, { visible: event.target.checked }),
                      )
                    }
                  />
                  <span>Visível</span>
                </label>
                <button
                  type="button"
                  className="studio-icon-button studio-icon-button--danger"
                  aria-label="Remover seção"
                  disabled={disabled}
                  onClick={() => {
                    if (selected?.sectionId === section.id) onSelect(null);
                    onUpdate((current) => removeSection(current, section.id));
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            <ul className="studio-block-list">
              {section.blocks.map((block, blockIndex) => {
                const active = selected?.blockId === block.id;
                return (
                  <li
                    key={block.id}
                    className={`studio-block${active ? ' is-active' : ''}${
                      block.visible ? '' : ' is-hidden'
                    }`}
                  >
                    <button
                      type="button"
                      className="studio-block__select"
                      onClick={() => onSelect({ sectionId: section.id, blockId: block.id })}
                    >
                      <span className="studio-block__type">{BLOCK_TYPE_LABELS[block.type]}</span>
                      <span className="studio-block__summary">{blockSummary(block)}</span>
                    </button>
                    <div className="studio-block__actions">
                      <button
                        type="button"
                        className="studio-icon-button"
                        aria-label="Mover bloco para cima"
                        disabled={disabled || blockIndex === 0}
                        onClick={() =>
                          onUpdate((current) => moveBlock(current, section.id, block.id, -1))
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="studio-icon-button"
                        aria-label="Mover bloco para baixo"
                        disabled={disabled || blockIndex === section.blocks.length - 1}
                        onClick={() =>
                          onUpdate((current) => moveBlock(current, section.id, block.id, 1))
                        }
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="studio-icon-button"
                        aria-label={block.visible ? 'Ocultar bloco' : 'Mostrar bloco'}
                        disabled={disabled}
                        onClick={() =>
                          onUpdate((current) =>
                            withBlock(current, section.id, block.id, { visible: !block.visible }),
                          )
                        }
                      >
                        {block.visible ? '◉' : '○'}
                      </button>
                      <button
                        type="button"
                        className="studio-icon-button studio-icon-button--danger"
                        aria-label="Remover bloco"
                        disabled={disabled}
                        onClick={() => {
                          if (active) onSelect(null);
                          onUpdate((current) => removeBlock(current, section.id, block.id));
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <BlockAdder
              disabled={disabled}
              onAdd={(type) => onUpdate((current) => addBlock(current, section.id, type))}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function BlockAdder({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (type: StudioBlockType) => void;
}) {
  const [type, setType] = useState<StudioBlockType>('text');
  return (
    <div className="studio-block-adder">
      <select
        className="studio-input studio-input--compact"
        aria-label="Tipo do novo bloco"
        value={type}
        disabled={disabled}
        onChange={(event) => setType(event.target.value as StudioBlockType)}
      >
        {BLOCK_TYPES.map((block) => (
          <option key={block.type} value={block.type}>
            {block.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="studio-button studio-button--small"
        disabled={disabled}
        onClick={() => onAdd(type)}
      >
        Adicionar bloco
      </button>
    </div>
  );
}
