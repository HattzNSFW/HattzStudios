import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '@hattz/profile-view';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  message: string | null;
}

/** Rede de segurança para erros de renderização inesperados (mantém o Share utilizável). */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { message: error instanceof Error ? error.message : 'Erro inesperado.' };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Observabilidade mínima: sem backend nesta fase, registramos no console.
    console.error('Share render error', error, info.componentStack);
  }

  private readonly handleRetry = () => {
    this.setState({ message: null });
  };

  override render(): ReactNode {
    if (this.state.message !== null) {
      return <ErrorState message={this.state.message} onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}
