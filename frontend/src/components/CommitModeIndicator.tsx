import React from 'react';
import { GitCommit, Shield, Zap } from 'lucide-react';
import type { CommitMode } from '../../../shared/types';

interface CommitModeIndicatorProps {
  mode?: CommitMode;
  className?: string;
}

export const CommitModeIndicator: React.FC<CommitModeIndicatorProps> = ({ mode, className = '' }) => {
  if (!mode) {
    return null;
  }

  const getModeConfig = () => {
    switch (mode) {
      case 'structured':
        return {
          icon: Shield,
          label: 'Structured',
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-100 dark:bg-blue-900/20',
          borderColor: 'border-blue-200 dark:border-blue-800',
          tooltip: 'Claude handles commits with proper messages'
        };
      case 'checkpoint':
        return {
          icon: Zap,
          label: 'Checkpoint',
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-100 dark:bg-green-900/20',
          borderColor: 'border-green-200 dark:border-green-800',
          tooltip: 'Auto-commits after each prompt'
        };
      case 'disabled':
        return {
          icon: GitCommit,
          label: 'Manual',
          color: 'text-gray-600 dark:text-gray-400',
          bgColor: 'bg-gray-100 dark:bg-gray-800',
          borderColor: 'border-gray-200 dark:border-gray-700',
          tooltip: 'Manual commits only'
        };
      default:
        return null;
    }
  };

  const config = getModeConfig();
  if (!config) {
    return null;
  }

  const Icon = config.icon;

  return (
    <div className={`group relative inline-flex ${className}`}>
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border ${config.bgColor} ${config.borderColor} ${config.color}`}>
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">{config.label}</span>
      </div>
      
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
        {config.tooltip}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
          <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
        </div>
      </div>
    </div>
  );
};