import { Component, type ErrorInfo, type ReactNode } from 'react';
import { toAppError } from '@/lib/result';
import { ErrorState } from './States';

interface Props {
  readonly children: ReactNode;
}
interface State {
  readonly error: Error | null;
}

/** Garde-fou par page : une erreur de rendu n'emporte jamais toute l'application. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <ErrorState
          error={toAppError(this.state.error)}
          onRetry={() => this.setState({ error: null })}
          className="m-6"
        />
      );
    }
    return this.props.children;
  }
}
