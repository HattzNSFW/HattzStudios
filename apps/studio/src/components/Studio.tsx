import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  deleteMediaAsset,
  storeMediaAsset,
  type MediaAssetKind,
  type MediaAssetRecord,
} from '../persistence';
import { useStudioEditor } from '../hooks/useStudioEditor';
import { useStudioMedia } from '../hooks/useStudioMedia';
import { useStudioPublication } from '../hooks/useStudioPublication';
import { BlockEditor } from './BlockEditor';
import { DataPanel } from './DataPanel';
import { PreviewPane } from './PreviewPane';
import { ProfileFields } from './ProfileFields';
import { ProfileSidebar } from './ProfileSidebar';
import { PublicationPanel } from './PublicationPanel';
import { SaveStatusBar } from './SaveStatusBar';
import { SectionsEditor } from './SectionsEditor';
import { ThemePanel } from './ThemePanel';
import type { SelectedBlock } from './types';

type StudioTab = 'perfil' | 'secoes' | 'tema' | 'publicacao' | 'dados';

const TABS: readonly { id: StudioTab; label: string }[] = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'secoes', label: 'Seções' },
  { id: 'tema', label: 'Tema' },
  { id: 'publicacao', label: 'Publicação' },
  { id: 'dados', label: 'Dados' },
];

export function Studio() {
  const editor = useStudioEditor();
  const activeProfile =
    editor.profiles.find((entry) => entry.technicalId === editor.activeProfileId) ?? null;
  const media = useStudioMedia(editor.activeProfileId);
  const publication = useStudioPublication({
    profileId: editor.activeProfileId,
    publicSlugDraft: activeProfile?.publicSlugDraft ?? null,
    draft: editor.draft,
    flush: editor.saveNow,
    getRevision: editor.getRevision,
  });
  const [tab, setTab] = useState<StudioTab>('perfil');
  const [selected, setSelected] = useState<SelectedBlock | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // O handler de upload captura o perfil no início, mas a promessa pode resolver depois de uma
  // troca. Este espelho síncrono evita anexar ao rascunho de B um asset pertencente a A.
  const activeProfileIdRef = useRef(editor.activeProfileId);
  useEffect(() => {
    activeProfileIdRef.current = editor.activeProfileId;
  }, [editor.activeProfileId]);

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
      const profileId = activeProfileIdRef.current;
      if (!profileId) return null;
      try {
        const asset = await storeMediaAsset({ profileTechnicalId: profileId, kind, blob: file });
        setUploadError(null);
        if (activeProfileIdRef.current !== profileId) {
          // O perfil ativo mudou durante o upload. O asset pertence ao perfil de origem e não pode
          // ser referenciado pelo rascunho de outro perfil (o Share rejeitaria a posse divergente).
          await deleteMediaAsset(asset.assetId).catch(() => undefined);
          reloadMedia();
          return null;
        }
        reloadMedia();
        return asset;
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : 'Falha ao salvar a mídia local.');
        return null;
      }
    },
    [reloadMedia],
  );

  const draft = editor.draft;

  const selectedBlock = useMemo(() => {
    if (tab !== 'secoes' || !selected || !draft) return null;
    const section = draft.sections.find((entry) => entry.id === selected.sectionId);
    if (!section) return null;
    const block = section.blocks.find((entry) => entry.id === selected.blockId);
    return block ? { section, block } : null;
  }, [draft, selected, tab]);

  const selectTabByKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    setTab(TABS[next]!.id);
    tabRefs.current[next]?.focus();
  };

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
            {TABS.map((entry, index) => (
              <button
                key={entry.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                id={`studio-tab-${entry.id}`}
                role="tab"
                aria-selected={tab === entry.id}
                aria-controls={`studio-panel-${entry.id}`}
                tabIndex={tab === entry.id ? 0 : -1}
                className={`studio-tab${tab === entry.id ? ' is-active' : ''}`}
                onClick={() => setTab(entry.id)}
                onKeyDown={(event) => selectTabByKeyboard(event, index)}
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
            <div
              className="studio-edit"
              role="tabpanel"
              id={`studio-panel-${tab}`}
              aria-labelledby={`studio-tab-${tab}`}
              tabIndex={0}
            >
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
              {tab === 'dados' && activeProfile ? (
                <DataPanel
                  profileId={activeProfile.technicalId}
                  slug={activeProfile.publicSlugDraft}
                  draft={draft}
                  media={media}
                  disabled={editor.busy}
                  flush={editor.saveNow}
                  getRevision={editor.getRevision}
                  reloadActive={editor.reloadActive}
                  clearActiveProfile={editor.clearActiveProfile}
                  refreshProfiles={editor.refreshProfiles}
                  onSlugChanged={() => void editor.refreshProfiles()}
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
