import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Studio } from '../../apps/studio/src/components/Studio';
import { closeStudioDb, getStudioDb } from '../../apps/studio/src/persistence/db';
import { listLocalProfiles, getWorkingDraft } from '../../apps/studio/src/persistence/repository';

describe('Studio editor (create / edit / autosave / reload)', () => {
  afterEach(async () => {
    const db = getStudioDb();
    await closeStudioDb();
    try {
      await db.delete();
    } catch {
      // ignore
    }
  });

  it('creates a profile, edits it, autosaves and survives a reload', async () => {
    const first = render(<Studio />);

    // Empty state before any profile exists.
    expect(await screen.findByText('Nenhum perfil ainda.')).toBeInTheDocument();
    expect(screen.getByText('Crie seu primeiro perfil')).toBeInTheDocument();

    // Create a profile from the sidebar.
    const newProfileInput = screen.getByLabelText('Novo perfil');
    fireEvent.change(newProfileInput, { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar perfil' }));

    const nameInput = await screen.findByLabelText('Nome de exibição');
    // The editor is revealed while the create action is still settling; wait until it is
    // interactive so edits are not dropped by a disabled control.
    await waitFor(() => expect(nameInput).toBeEnabled());
    expect(nameInput).toHaveValue('Alice');

    // Edit the display name; autosave (debounced) must persist it.
    fireEvent.change(nameInput, { target: { value: 'Alice Andrade' } });

    await waitFor(
      async () => {
        const profiles = await listLocalProfiles();
        expect(profiles[0]?.displayName).toBe('Alice Andrade');
      },
      { timeout: 5000 },
    );

    const technicalId = (await listLocalProfiles())[0]!.technicalId;
    const working = await getWorkingDraft(technicalId);
    expect(working?.content).toMatchObject({ profile: { displayName: 'Alice Andrade' } });

    // The status bar must settle on a saved state (autosave completed, not just scheduled).
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Salvo/), {
      timeout: 5000,
    });

    // Simulate closing and reopening the app.
    first.unmount();

    render(<Studio />);
    const profileButton = await screen.findByRole('button', { name: /Alice Andrade/ });
    fireEvent.click(profileButton);

    const reloadedName = await screen.findByLabelText('Nome de exibição');
    expect(reloadedName).toHaveValue('Alice Andrade');
  });

  it('lets the user add a section and a block, then reflects them in the stored draft', async () => {
    render(<Studio />);
    await screen.findByText('Nenhum perfil ainda.');

    fireEvent.change(screen.getByLabelText('Novo perfil'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar perfil' }));
    const nameInput = await screen.findByLabelText('Nome de exibição');
    await waitFor(() => expect(nameInput).toBeEnabled());

    // Go to the sections tab.
    fireEvent.click(screen.getByRole('tab', { name: 'Seções' }));
    expect(screen.getByText(/Nenhuma seção ainda/)).toBeInTheDocument();

    const addSectionButton = screen.getByRole('button', { name: 'Adicionar seção' });
    await waitFor(() => expect(addSectionButton).toBeEnabled());
    fireEvent.click(addSectionButton);
    // A section renders its own block adder, which only exists once a section is present.
    const addBlockButton = await screen.findByRole('button', { name: 'Adicionar bloco' });
    expect(screen.queryByText(/Nenhuma seção ainda/)).not.toBeInTheDocument();

    fireEvent.click(addBlockButton);

    await waitFor(
      async () => {
        const profiles = await listLocalProfiles();
        const id = profiles[0]!.technicalId;
        const working = await getWorkingDraft(id);
        const sections = working?.content.sections as Array<{ blocks: unknown[] }> | undefined;
        expect(sections?.[0]?.blocks.length).toBe(1);
      },
      { timeout: 5000 },
    );
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Salvo/), {
      timeout: 5000,
    });
  });
});
