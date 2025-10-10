import React, { Component, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from './ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, errorInfo: React.ErrorInfo) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    console.error('Component stack:', errorInfo.componentStack);
    this.setState({ errorInfo });

    // Log to file in development mode for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('[ErrorBoundary] Full error details:', {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack
      });
    }
  }

  render() {
    if (this.state.hasError) {
      // If a custom fallback is provided, use it
      if (this.props.fallback && this.state.error && this.state.errorInfo) {
        return this.props.fallback(this.state.error, this.state.errorInfo);
      }

      // Default error UI
      return (
        <div className="flex items-center justify-center h-screen p-8 bg-bg-primary">
          <div className="text-center max-w-2xl">
            <AlertCircle className="w-16 h-16 text-status-error mx-auto mb-6" />
            <h2 className="text-2xl font-semibold text-text-primary mb-3">
              Something went wrong
            </h2>
            <p className="text-text-secondary mb-6">
              Crystal encountered an unexpected error and needs to reload.
            </p>

            {/* Error details */}
            {this.state.error && (
              <div className="bg-surface-secondary border border-border-primary rounded-lg p-4 mb-6 text-left">
                <p className="font-mono text-sm text-status-error mb-2">
                  {this.state.error.message}
                </p>
                {process.env.NODE_ENV === 'development' && this.state.error.stack && (
                  <details className="text-xs text-text-muted mt-2">
                    <summary className="cursor-pointer hover:text-text-secondary">
                      Stack trace (dev only)
                    </summary>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => window.location.reload()}
                variant="primary"
              >
                Reload Application
              </Button>
              <Button
                onClick={() => {
                  // Try to reset state and recover
                  this.setState({ hasError: false, error: null, errorInfo: null });
                }}
                variant="secondary"
              >
                Try to Continue
              </Button>
            </div>

            <p className="text-xs text-text-muted mt-6">
              If this keeps happening, please report it on GitHub
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}