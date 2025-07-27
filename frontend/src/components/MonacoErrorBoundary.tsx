import React, { Component, ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface MonacoErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
}

interface MonacoErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

export class MonacoErrorBoundary extends Component<MonacoErrorBoundaryProps, MonacoErrorBoundaryState> {
  constructor(props: MonacoErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<MonacoErrorBoundaryState> {
    // Check if this is the Monaco editor error we're trying to handle
    if (error.message?.includes('getFullModelRange') || 
        error.message?.includes('TextModel') ||
        error.message?.includes('disposed') ||
        error.message?.includes('DiffEditorWidget')) {
      console.warn('Monaco editor error caught, will recover:', error.message);
      return { hasError: true, error };
    }
    // Re-throw other errors
    throw error;
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn('Monaco editor error details:', { error, errorInfo });
    this.setState(prev => ({ errorCount: prev.errorCount + 1 }));
    
    // Auto-recover after a short delay
    setTimeout(() => {
      this.resetError();
    }, 100);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      // Show a brief loading state while auto-recovering
      return (
        <div className="flex items-center justify-center h-full p-8">
          <div className="flex items-center gap-2 text-text-tertiary">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Reloading editor...</span>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}