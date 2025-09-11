import { ToolPanel, ToolPanelType } from '../../../shared/types/panels';

export interface PanelTabBarProps {
  panels: ToolPanel[];
  activePanel?: ToolPanel;
  onPanelSelect: (panel: ToolPanel) => void;
  onPanelClose: (panel: ToolPanel) => void;
  onPanelCreate: (type: ToolPanelType) => void;
}

export interface PanelContainerProps {
  panel: ToolPanel;
  isActive: boolean;
}

export interface TerminalPanelProps {
  panel: ToolPanel;
  isActive: boolean;
}