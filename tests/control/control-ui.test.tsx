import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BADGE_CATALOG } from '@hattz/core';
import { Control } from '../../apps/control/src/Control';
import { buildControlSnapshot, type ControlSnapshot } from '../../apps/control/src/controlModel';
import type { ControlDataSource } from '../../apps/control/src/controlSource';
import { resolveHubRoute } from '../../hub/routing';

function sourceFor(snapshot: ControlSnapshot): ControlDataSource {
  return { loadSnapshot: async () => snapshot };
}

async function region(name: string): Promise<HTMLElement> {
  return (await screen.findByRole('region', { name })) as HTMLElement;
}

describe('Control — interface de consulta somente leitura', () => {
  afterEach(cleanup);

  it('mantém a rota /control funcionando no hub', () => {
    expect(resolveHubRoute('/control')).toEqual({ type: 'redirect', location: '/control/' });
    expect(resolveHubRoute('/control/')).toEqual({
      type: 'rewrite',
      url: '/apps/control/index.html',
    });
    expect(resolveHubRoute('/control/src/main.tsx')).toEqual({
      type: 'rewrite',
      url: '/apps/control/src/main.tsx',
    });
  });

  it('apresenta catálogos, cargos, benefícios e estado vazio de coleções com dados reais', async () => {
    render(<Control source={sourceFor(buildControlSnapshot())} />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Control' })).toBeVisible();
    expect(screen.getByText(/Consulta somente leitura/)).toBeVisible();

    const badges = await region('Catálogo de badges');
    expect(within(badges).getByText('Membro Inicial')).toBeVisible();
    expect(within(badges).getByText('early-member')).toBeVisible();
    expect(within(badges).getAllByText('Perfil')).toHaveLength(2);
    expect(within(badges).getByText('Exclusivo')).toBeVisible();
    expect(within(badges).getAllByText('Item especial')).toHaveLength(4);
    expect(within(badges).getAllByText('Produção').length).toBeGreaterThan(0);

    const frames = await region('Catálogo de molduras');
    expect(within(frames).getByText('Moldura Padrão')).toBeVisible();
    expect(within(frames).getByText('Moldura VIP')).toBeVisible();
    expect(within(frames).getAllByText('Permanente')).toHaveLength(2);
    expect(within(frames).getAllByText('Estática')).toHaveLength(2);
    expect(within(frames).getAllByText('Sem arte associada no catálogo nesta etapa.')).toHaveLength(
      2,
    );

    const roles = await region('Cargos');
    for (const name of ['Membro', 'VIP', 'Creator', 'Owner']) {
      expect(within(roles).getByText(name)).toBeVisible();
    }
    expect(within(roles).getAllByText('Privado')).toHaveLength(2);
    expect(within(roles).getByText(/cargo público Owner/)).toBeVisible();
    expect(within(roles).getByText(/equivale à autoridade administrativa/)).toBeVisible();
    expect(within(roles).getAllByText('Herdados (não são concessões independentes)')).toHaveLength(
      4,
    );

    const benefits = await region('Benefícios');
    expect(within(benefits).getByText('Benefícios próprios do VIP')).toBeVisible();
    expect(within(benefits).getByText('Acesso administrativo ao Control')).toBeVisible();
    // Benefício administrativo: sem cargo direto e sem cargo herdado.
    expect(within(benefits).getAllByText('Nenhum cargo associado.')).toHaveLength(2);
    expect(within(benefits).getByText(/Benefícios herdados não são duplicados/)).toBeVisible();

    const collections = await region('Coleções');
    expect(within(collections).getByText('Nenhuma coleção cadastrada')).toBeVisible();
    expect(
      within(collections).getByText(/Não há coleções, recompensas ou progresso/),
    ).toBeVisible();
  });

  it('trata catálogos vazios com estados vazios e contagens zero', async () => {
    const empty = buildControlSnapshot({
      badges: [],
      frames: [],
      roles: [],
      benefits: [],
      collections: [],
    });
    render(<Control source={sourceFor(empty)} />);

    const overview = await region('Visão geral');
    await waitFor(() => expect(within(overview).getAllByText('0')).toHaveLength(7));
    expect(within(overview).getByText('Nenhum dado cadastrado')).toBeVisible();

    expect(
      within(await region('Catálogo de badges')).getByText('Nenhum badge cadastrado'),
    ).toBeVisible();
    expect(
      within(await region('Catálogo de molduras')).getByText('Nenhuma moldura cadastrada'),
    ).toBeVisible();
    expect(within(await region('Cargos')).getByText('Nenhum cargo definido')).toBeVisible();
    expect(within(await region('Benefícios')).getByText('Nenhum benefício definido')).toBeVisible();
    expect(within(await region('Coleções')).getByText('Nenhuma coleção cadastrada')).toBeVisible();
  });

  it('identifica dados de demonstração sem apresentá-los como concessões reais', async () => {
    const original = BADGE_CATALOG[0]!;
    const demo = buildControlSnapshot({ badges: [{ ...original, isDemo: true }] });
    const { container } = render(<Control source={sourceFor(demo)} />);

    const badges = await region('Catálogo de badges');
    expect(within(badges).getByText('Demonstração')).toBeVisible();
    expect(within(badges).queryByText('Concedido com sucesso')).toBeNull();
    expect(screen.getByText(/Dados de demonstração são fictícios/)).toBeVisible();
    expect(screen.getByText(/nunca representam concessões reais/)).toBeVisible();
    expect(container.textContent).not.toMatch(/concessão real/i);
  });

  it('não oferece operações administrativas nem controles de escrita', async () => {
    const { container } = render(<Control source={sourceFor(buildControlSnapshot())} />);
    await screen.findByText('Membro Inicial');

    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('input, select, textarea, form')).toHaveLength(0);
    expect(screen.queryByRole('button')).toBeNull();
    expect(
      screen.queryByText(/Conceder|Revogar|Editar catálogo|Criar sessão administrativa/),
    ).toBeNull();
  });

  it('exibe estados de carregamento, erro e recuperação sem operações administrativas', async () => {
    let resolveLoad: ((snapshot: ControlSnapshot) => void) | null = null;
    const pending: ControlDataSource = {
      loadSnapshot: () =>
        new Promise<ControlSnapshot>((resolve) => {
          resolveLoad = resolve;
        }),
    };
    const first = render(<Control source={pending} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando catálogos e contratos…');

    const snapshot = buildControlSnapshot();
    await act(async () => {
      resolveLoad!(snapshot);
    });
    expect(await screen.findByText('Membro Inicial')).toBeVisible();
    first.unmount();

    let attempts = 0;
    let failNext = true;
    const flaky: ControlDataSource = {
      loadSnapshot: async () => {
        attempts += 1;
        if (failNext) {
          failNext = false;
          throw new Error('falha de leitura local');
        }
        return snapshot;
      },
    };
    render(<Control source={flaky} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('falha de leitura local');

    fireEvent.click(screen.getByRole('button', { name: 'Tentar carregar novamente' }));
    expect(await screen.findByText('Moldura Padrão')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(attempts).toBe(2);
  });
});
