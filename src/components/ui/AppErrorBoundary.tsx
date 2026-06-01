import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; info: string }

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: '' };
  }

  componentDidCatch(_error: Error, info: ErrorInfo) {
    this.setState({ info: info.componentStack ?? '' });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="bg-card border border-danger rounded-xl p-6 max-w-2xl w-full">
          <h1 className="text-danger font-bold text-lg mb-2">App-Fehler</h1>
          <p className="text-primary text-sm mb-4">{error.message}</p>
          <pre className="text-xs text-secondary bg-background rounded p-3 overflow-auto max-h-48 mb-4">
            {info || error.stack}
          </pre>
          <button
            onClick={() => { this.setState({ error: null, info: '' }); window.location.reload(); }}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm"
          >
            Seite neu laden
          </button>
        </div>
      </div>
    );
  }
}
