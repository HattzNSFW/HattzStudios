import { useState } from 'react';
import type { LocalProfileRecord } from '../persistence';

interface ProfileSidebarProps {
  profiles: LocalProfileRecord[];
  activeProfileId: string | null;
  busy: boolean;
  storageReady: boolean;
  storageError: string | null;
  onSelect: (technicalId: string) => void;
  onCreate: (displayName: string) => void;
}

export function ProfileSidebar({
  profiles,
  activeProfileId,
  busy,
  storageReady,
  storageError,
  onSelect,
  onCreate,
}: ProfileSidebarProps) {
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName('');
  };

  return (
    <aside className="studio-sidebar hattz-liquid-glass" aria-label="Perfis locais">
      <div className="studio-sidebar__header">
        <p className="studio-eyebrow">Hättz Studio</p>
        <h1 className="studio-sidebar__title">Perfis</h1>
      </div>

      <ul className="studio-profile-list">
        {profiles.length === 0 ? (
          <li className="studio-profile-list__empty">
            {storageReady ? 'Nenhum perfil ainda.' : 'Carregando perfis…'}
          </li>
        ) : (
          profiles.map((profile) => {
            const active = profile.technicalId === activeProfileId;
            return (
              <li key={profile.technicalId}>
                <button
                  type="button"
                  className={`studio-profile-item${active ? ' is-active' : ''}`}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onSelect(profile.technicalId)}
                >
                  <span className="studio-profile-item__name">
                    {profile.displayName || 'Perfil sem nome'}
                  </span>
                  <span className="studio-profile-item__meta">
                    {profile.lastPublishedVersion
                      ? `publicado (local) v${profile.lastPublishedVersion}`
                      : 'rascunho'}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>

      <div className="studio-create">
        <label className="studio-field__label" htmlFor="studio-new-profile">
          Novo perfil
        </label>
        <input
          id="studio-new-profile"
          className="studio-input"
          type="text"
          value={newName}
          placeholder="Nome de exibição"
          maxLength={80}
          disabled={busy}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleCreate();
          }}
        />
        <button
          type="button"
          className="studio-button studio-button--primary"
          onClick={handleCreate}
          disabled={busy || newName.trim() === ''}
        >
          Criar perfil
        </button>
      </div>

      {storageError ? (
        <p className="studio-sidebar__error" role="alert">
          {storageError}
        </p>
      ) : null}
    </aside>
  );
}
