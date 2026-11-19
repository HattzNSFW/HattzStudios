import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../../apps/share/src/rendering/ErrorBoundary';

const SENSITIVE_DETAIL = 'SUPER_SECRET token=abc123 dsn=postgres://internal';

describe('Share ErrorBoundary — mensagens públicas', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('não expõe detalhes de erro de renderização na UI pública', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;

    function FlakyChild() {
      if (shouldThrow) throw new Error(SENSITIVE_DETAIL);
      return <p>Conteúdo recuperado</p>;
    }

    render(
      <ErrorBoundary>
        <FlakyChild />
      </ErrorBoundary>,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar este perfil.');
    expect(alert).not.toHaveTextContent(SENSITIVE_DETAIL);
    expect(alert).not.toHaveTextContent('postgres://internal');

    // O diagnóstico continua disponível apenas no console.
    expect(
      consoleError.mock.calls.some((args) =>
        args.some((arg) => arg instanceof Error && arg.message === SENSITIVE_DETAIL),
      ),
    ).toBe(true);

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Conteúdo recuperado')).toBeVisible();
  });
});
