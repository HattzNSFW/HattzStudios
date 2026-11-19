import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '@hattz/profile-view';
import { PUBLIC_PROFILE_ERROR_MESSAGE } from '../publicMessages';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Rede de segurança para erros de renderização inesperados (mantém o Share utilizável). */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  /**
   * A mensagem da exceção NUNCA entra no estado público: ela pode conter detalhes internos
   * (DSNs, tokens, caminhos). O diagnóstico completo fica apenas em `componentDidCatch`.
   */
  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Observabilidade mínima: sem backend nesta fase, registramos no console.
    console.error('Share render error', error, info.componentStack);
  }

  private readonly handleRetry = () => {
    this.setState({ hasError: false });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return <ErrorState message={PUBLIC_PROFILE_ERROR_MESSAGE} onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}
