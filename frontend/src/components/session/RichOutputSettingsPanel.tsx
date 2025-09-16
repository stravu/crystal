import React from 'react';
import { Wrench, Brain, Terminal, Maximize2, Package } from 'lucide-react';
import { SwitchSimple } from '../ui/SwitchSimple';
import { RichOutputSettings } from '../panels/ai/AbstractAIPanel';

interface RichOutputSettingsPanelProps {
  settings: RichOutputSettings;
  onSettingsChange: (settings: RichOutputSettings) => void;
  onClose: () => void;
}

export const RichOutputSettingsPanel: React.FC<RichOutputSettingsPanelProps> = ({
  settings,
  onSettingsChange,
  onClose,
}) => {
  const toggleSetting = (key: keyof RichOutputSettings) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    onSettingsChange(newSettings);
  };

  return (
    <>
      {/* Backdrop to close settings when clicking outside */}
      <div 
        className="fixed inset-0 z-20" 
        onClick={onClose}
      />
      
      {/* Settings Dropdown - positioned below tab bar */}
      <div className="fixed top-[140px] right-4 w-80 z-30 bg-surface-primary border border-border-primary rounded-lg shadow-lg animate-in fade-in slide-in-from-top-1 duration-200">
        <div className="p-4">
          <div className="space-y-4">
            {/* Content Display Settings */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">Content</h4>
              
              <div className="space-y-1">
                <div className="flex items-center justify-between py-1.5 hover:bg-surface-hover rounded px-2 -mx-2 transition-colors">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-3.5 h-3.5 text-text-tertiary" />
                    <span className="text-sm text-text-primary">Tool Calls</span>
                  </div>
                  <SwitchSimple
                    checked={settings.showToolCalls}
                    onCheckedChange={() => toggleSetting('showToolCalls')}
                    size="sm"
                  />
                </div>
                
                <div className="flex items-center justify-between py-1.5 hover:bg-surface-hover rounded px-2 -mx-2 transition-colors">
                  <div className="flex items-center gap-2">
                    <Brain className="w-3.5 h-3.5 text-text-tertiary" />
                    <span className="text-sm text-text-primary">Thinking Process</span>
                  </div>
                  <SwitchSimple
                    checked={settings.showThinking}
                    onCheckedChange={() => toggleSetting('showThinking')}
                    size="sm"
                  />
                </div>
                
                <div className="flex items-center justify-between py-1.5 hover:bg-surface-hover rounded px-2 -mx-2 transition-colors">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-text-tertiary" />
                    <span className="text-sm text-text-primary">Session Info</span>
                  </div>
                  <SwitchSimple
                    checked={settings.showSessionInit}
                    onCheckedChange={() => toggleSetting('showSessionInit')}
                    size="sm"
                  />
                </div>
              </div>
            </div>
            
            <div className="h-px bg-border-primary"></div>
            
            {/* Layout Settings */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">Layout</h4>
              
              <div className="space-y-1">
                <div className="flex items-center justify-between py-1.5 hover:bg-surface-hover rounded px-2 -mx-2 transition-colors">
                  <div className="flex items-center gap-2">
                    <Maximize2 className="w-3.5 h-3.5 text-text-tertiary" />
                    <span className="text-sm text-text-primary">Compact View</span>
                  </div>
                  <SwitchSimple
                    checked={settings.compactMode}
                    onCheckedChange={() => toggleSetting('compactMode')}
                    size="sm"
                  />
                </div>
                
                <div className="flex items-center justify-between py-1.5 hover:bg-surface-hover rounded px-2 -mx-2 transition-colors">
                  <div className="flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-text-tertiary" />
                    <span className="text-sm text-text-primary">Minimize Tools</span>
                  </div>
                  <SwitchSimple
                    checked={settings.collapseTools}
                    onCheckedChange={() => toggleSetting('collapseTools')}
                    size="sm"
                  />
                </div>
                
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};