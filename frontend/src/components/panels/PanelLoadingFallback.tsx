import React from 'react';
import { RefreshCw } from 'lucide-react';

interface PanelLoadingFallbackProps {
  panelType?: string;
  message?: string;
}

/**
 * Optimized loading fallback for lazy-loaded panels
 * Reduces unnecessary re-renders and provides better UX
 */
export const PanelLoadingFallback: React.FC<PanelLoadingFallbackProps> = React.memo(({ 
  panelType = 'panel',
  message
}) => (
  <div className="flex items-center justify-center h-full bg-bg-primary">
    <div className="text-center">
      <RefreshCw 
        className="w-8 h-8 text-text-secondary animate-spin mx-auto mb-3" 
        aria-hidden="true"
      />
      <p className="text-sm text-text-secondary">
        {message || `Loading ${panelType} panel...`}
      </p>
    </div>
  </div>
));

PanelLoadingFallback.displayName = 'PanelLoadingFallback';