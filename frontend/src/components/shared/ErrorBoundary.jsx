// frontend/src/components/shared/ErrorBoundary.jsx
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Render error caught by ErrorBoundary:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 dark:bg-gray-950">
        <div className="card max-w-lg p-8 text-center">
          <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Something went wrong loading this page
          </h2>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            {error?.message || 'An unexpected error occurred.'}
          </p>
          {import.meta.env.DEV && error?.stack && (
            <pre className="mb-4 max-h-64 overflow-auto rounded-lg bg-gray-100 p-3 text-left text-[11px] text-gray-600 dark:bg-gray-900 dark:text-gray-400">
              {error.stack}
            </pre>
          )}
          <div className="flex justify-center gap-3">
            <button onClick={this.handleReset} className="btn-secondary px-4 text-sm">
              Try again
            </button>
            <button onClick={() => { window.location.href = '/dashboard'; }} className="btn-primary px-4 text-sm">
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}