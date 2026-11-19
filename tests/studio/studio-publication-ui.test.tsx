import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Studio } from '../../apps/studio/src/components/Studio';
import { closeStudioDb, getStudioDb } from '../../apps/studio/src/persistence/db';
import {
  getCurrentPublication,
  listLocalProfiles,
  listPublications,
} from '../../apps/studio/src/persistence/repository';

function publicationPanel(): HTMLElement {
  return screen.getByText('Histórico de versões').closest('.studio-publication') as HTMLElement;
}

async function createProfile(name: string): Promise<HTMLInputElement> {
  await screen.findByText('Nenhum perfil ainda.');
  fireEvent.change(screen.getByLabelText('Novo perfil'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar perfil' }));
  const nameInput = (await screen.findByLabelText('Nome de exibição')) as HTMLInputElement;
  // Wait until the create action settles (controls enabled) so later clicks are not swallowed.
  await waitFor(() => expect(nameInput).toBeEnabled());
  return nameInput;
}

async function clickEnabledButton(name: string | RegExp): Promise<void> {
  const button = screen.getByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

async function activeProfileId(): Promise<string> {
  const profiles = await listLocalProfiles();
  return profiles[0]!.technicalId;
}

describe('Studio publication UI (local publication flow)', () => {
  afterEach(async () => {
    const db = getStudioDb();
    await closeStudioDb();
    try {
      await db.delete();
    } catch {
      // ignore
    }
  });

  it('publishes locally from the Publicação tab with an explicit local-vs-public notice', async () => {
    render(<Studio />);
    await createProfile('Alice');

    // Saving the draft must never auto-publish.
    expect(await listPublications(await activeProfileId())).toEqual([]);

    fireEvent.click(screen.getByRole('tab', { name: 'Publicação' }));

    const notice = screen.getByRole('note');
    expect(notice).toHaveTextContent('Publicação local ≠ publicação pública');
    expect(
      screen.getByText('Nenhuma versão publicada ainda. Publique para criar a primeira versão.'),
    ).toBeInTheDocument();

    await clickEnabledButton('Publicar versão');

    await waitFor(() =>
      expect(within(publicationPanel()).getByText('publicada (atual)')).toBeInTheDocument(),
    );
    expect(within(publicationPanel()).getByText(/Versão publicada:/)).toHaveTextContent('v1');

    // The sidebar label makes the local (non-public) state explicit.
    const sidebar = screen.getByRole('complementary', { name: 'Perfis locais' });
    expect(await within(sidebar).findByText('publicado (local) v1')).toBeInTheDocument();
  });

  it('does not auto-publish on draft save and keeps the published preview frozen after edits', async () => {
    render(<Studio />);
    const nameInput = await createProfile('Alice');
    const id = await activeProfileId();

    fireEvent.change(nameInput, { target: { value: 'Alice Andrade' } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Salvo/), {
      timeout: 5000,
    });
    expect(await listPublications(id)).toEqual([]);

    fireEvent.click(screen.getByRole('tab', { name: 'Publicação' }));
    await clickEnabledButton('Publicar versão');
    await waitFor(() =>
      expect(within(publicationPanel()).getByText('publicada (atual)')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Publicado' }));
    const frame = screen.getByLabelText('Prévia do perfil');
    expect(within(frame).getByRole('heading', { level: 1 })).toHaveTextContent('Alice Andrade');

    // Edit the draft (on the Perfil tab) after publishing.
    fireEvent.click(screen.getByRole('tab', { name: 'Perfil' }));
    fireEvent.change(screen.getByLabelText('Nome de exibição'), {
      target: { value: 'Alice Editada' },
    });
    await waitFor(
      async () => {
        const profiles = await listLocalProfiles();
        expect(profiles[0]?.displayName).toBe('Alice Editada');
      },
      { timeout: 5000 },
    );

    // The draft preview reflects the edit and flags the divergence...
    fireEvent.click(screen.getByRole('button', { name: 'Rascunho' }));
    expect(within(frame).getByRole('heading', { level: 1 })).toHaveTextContent('Alice Editada');
    expect(screen.getByText(/difere da versão publicada/)).toBeInTheDocument();

    // ...but the published preview still reads only the immutable snapshot.
    fireEvent.click(screen.getByRole('button', { name: 'Publicado' }));
    expect(within(frame).getByRole('heading', { level: 1 })).toHaveTextContent('Alice Andrade');

    const stored = await getCurrentPublication(id);
    expect(stored?.version).toBe(1);
    expect(stored?.content).toMatchObject({ profile: { displayName: 'Alice Andrade' } });
  });

  it('unpublishes and returns to a clear empty published state', async () => {
    render(<Studio />);
    await createProfile('Alice');

    fireEvent.click(screen.getByRole('tab', { name: 'Publicação' }));
    await clickEnabledButton('Publicar versão');
    await waitFor(() =>
      expect(within(publicationPanel()).getByText('publicada (atual)')).toBeInTheDocument(),
    );

    await clickEnabledButton('Despublicar');

    await waitFor(() =>
      expect(
        screen.getByText('Nenhuma versão publicada ainda. Publique para criar a primeira versão.'),
      ).toBeInTheDocument(),
    );
    expect(within(publicationPanel()).getByText('despublicada')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Publicado' }));
    expect(screen.getByText('Nenhuma versão publicada')).toBeInTheDocument();
  });

  it('publishes the current draft even when an autosave is already in flight (flush race)', async () => {
    render(<Studio />);
    const nameInput = await createProfile('Alice');
    const id = await activeProfileId();

    // Edit the draft and force an immediate flush (pagehide) so a save is in flight...
    fireEvent.change(nameInput, { target: { value: 'Alice Sincronizada' } });
    fireEvent(window, new Event('pagehide'));

    // ...and publish right away, before that save settles. Publishing must flush the pending
    // save first; otherwise the new revision would make the publish look stale.
    fireEvent.click(screen.getByRole('tab', { name: 'Publicação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publicar versão' }));

    await waitFor(() =>
      expect(within(publicationPanel()).getByText('publicada (atual)')).toBeInTheDocument(),
    );

    expect(screen.queryByText(/O rascunho mudou enquanto era publicado/)).toBeNull();
    const stored = await getCurrentPublication(id);
    expect(stored?.version).toBe(1);
    expect(stored?.content).toMatchObject({ profile: { displayName: 'Alice Sincronizada' } });
  });

  it('blocks publishing invalid content and explains why', async () => {
    render(<Studio />);
    const nameInput = await createProfile('Alice');
    fireEvent.change(nameInput, { target: { value: '' } });

    fireEvent.click(screen.getByRole('tab', { name: 'Publicação' }));

    expect(screen.getByText(/Corrija os problemas abaixo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar versão' })).toBeDisabled();
  });
});
