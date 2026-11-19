import { useCallback, useMemo, useState } from 'react';
import { storeMediaAsset, type MediaAssetKind, type MediaAssetRecord } from '../persistence';
import { useStudioEditor } from '../hooks/useStudioEditor';
import { useStudioMedia } from '../hooks/useStudioMedia';
import { useStudioPublication } from '../hooks/useStudioPublication';
import { BlockEditor } from './BlockEditor';
import { PreviewPane } from './PreviewPane';
import { ProfileFields } from './ProfileFields';
import { ProfileSidebar } from './ProfileSidebar';
import { PublicationPanel } from './PublicationPanel';
import { SaveStatusBar } from './SaveStatusBar';
import { SectionsEditor } from './SectionsEditor';
import { ThemePanel } from './ThemePanel';
import type { SelectedBlock } from './types';

type StudioTab = 'perfil' | 'secoes' | 'tema' | 'publicacao';

const TABS: readonly { id: StudioTab; label: string }[] = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'secoes', label: 'Seções' },
  { id: 'tema', label: 'Tema' },
  { id: 'publicacao', label: 'Publicação' },
];

export function Studio() {
  const editor = useStudioEditor();
  const media = useStudioMedia(editor.activeProfileId);
  const publication = useStudioPublication({
    profileId: editor.activeProfileId,
    draft: editor.draft,
    flush: editor.saveNow,
    getRevision: editor.getRevision,
  });
  const [tab, setTab] = useState<StudioTab>('perfil');
  const [selected, setSelected] = useState<SelectedBlock | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const reloadMedia = media.reload;
  const refreshProfiles = editor.refreshProfiles;
  const publish = publication.publish;
  const unpublish = publication.unpublish;

  const handlePublish = useCallback(() => {
    void publish().then(() => refreshProfiles());
  }, [publish, refreshProfiles]);

  const handleUnpublish = useCallback(() => {
    void unpublish().then(() => refreshProfiles());
  }, [unpublish, refreshProfiles]);

  const handleUpload = useCallback(
    async (kind: MediaAssetKind, file: File): Promise<MediaAssetRecord | null> => {
      const profileId = editor.activeProfileId;
      if (!profileId) return null;
      try {
        const asset = await storeMediaAsset({ profileTechnicalId: profileId, kind, blob: file });
        setUploadError(null);
        reloadMedia();
        return asset;
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : 'Falha ao salvar a mídia local.');
        return null;
      }
    },
    [editor.activeProfileId, reloadMedia],
  );

  const draft = editor.draft;

  const selectedBlock = useMemo(() => {
    if (tab !== 'secoes' || !selected || !draft) return null;
    const section = draft.sections.find((entry) => entry.id === selected.sectionId);
    if (!section) return null;
    const block = section.blocks.find((entry) => entry.id === selected.blockId);
    return block ? { section, block } : null;
  }, [draft, selected, tab]);

  return (
    <div className="studio-app">
      <ProfileSidebar
        profiles={editor.profiles}
        activeProfileId={editor.activeProfileId}
        busy={editor.busy}
        storageReady={editor.storageReady}
        storageError={editor.storageError}
        onSelect={(id) => {
          setSelected(null);
          void editor.selectProfile(id);
        }}
        onCreate={(name) => {
          setSelected(null);
          setTab('perfil');
          void editor.createProfile(name);
        }}
      />

      <main className="studio-main">
        <div className="studio-topbar">
          <div className="studio-tabs" role="tablist" aria-label="Áreas de edição">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                className={`studio-tab${tab === entry.id ? ' is-active' : ''}`}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <SaveStatusBar
            status={editor.saveStatus}
            error={editor.saveError}
            lastSavedAt={editor.lastSavedAt}
            disabled={!draft}
            onSave={() => void editor.saveNow()}
            onReload={() => void editor.reloadActive()}
          />
        </div>

        {uploadError ? (
          <p className="studio-banner-error" role="alert">
            {uploadError}
          </p>
        ) : null}

        {draft === null ? (
          <div className="studio-welcome hattz-liquid-glass">
            <p className="studio-eyebrow">Hättz Studio</p>
            <h2 className="studio-welcome__title">Crie seu primeiro perfil</h2>
            <p className="studio-welcome__text">
              Use a barra lateral para criar um perfil local. Tudo é salvo automaticamente no seu
              navegador (IndexedDB) e funciona sem internet.
            </p>
          </div>
        ) : (
          <div className="studio-content">
            <div className="studio-edit">
              {tab === 'perfil' ? (
                <ProfileFields
                  draft={draft}
                  media={media}
                  disabled={editor.busy}
                  onUpdate={editor.updateDraft}
                  onUpload={handleUpload}
                />
              ) : null}
              {tab === 'secoes' ? (
                <SectionsEditor
                  draft={draft}
                  selected={selected}
                  disabled={editor.busy}
                  onSelect={setSelected}
                  onUpdate={editor.updateDraft}
                />
              ) : null}
              {tab === 'tema' ? (
                <ThemePanel draft={draft} disabled={editor.busy} onUpdate={editor.updateDraft} />
              ) : null}
              {tab === 'publicacao' ? (
                <PublicationPanel
                  draft={draft}
                  current={publication.current}
                  history={publication.history}
                  status={publication.status}
                  error={publication.error}
                  issues={publication.issues}
                  differsFromPublished={publication.differsFromPublished}
                  disabled={editor.busy}
                  onPublish={handlePublish}
                  onUnpublish={handleUnpublish}
                />
              ) : null}
            </div>

            <div className="studio-aside">
              {selectedBlock ? (
                <BlockEditor
                  section={selectedBlock.section}
                  block={selectedBlock.block}
                  media={media}
                  disabled={editor.busy}
                  onUpdate={editor.updateDraft}
                  onUpload={handleUpload}
                  onClose={() => setSelected(null)}
                />
              ) : (
                <div className="studio-panel studio-properties studio-properties--empty">
                  <h2 className="studio-panel__title">Propriedades</h2>
                  <p className="studio-empty">
                    {tab === 'secoes'
                      ? 'Selecione um bloco para editar suas propriedades.'
                      : 'As propriedades do bloco aparecem aqui na aba Seções.'}
                  </p>
                </div>
              )}
              <PreviewPane
                draft={draft}
                media={media}
                published={publication.current}
                differsFromPublished={publication.differsFromPublished}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
