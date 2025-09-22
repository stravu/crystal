import { ipcMain } from 'electron';
import type { AppServices } from './types';
import { registerAppHandlers } from './app';
import { registerUpdaterHandlers } from './updater';
import { registerSessionHandlers } from './session';
import { registerProjectHandlers } from './project';
import { registerConfigHandlers } from './config';
import { registerDialogHandlers } from './dialog';
import { registerGitHandlers } from './git';
import { registerScriptHandlers } from './script';
import { registerPromptHandlers } from './prompt';
import { registerStravuHandlers } from './stravu';
import { registerFileHandlers } from './file';
import { registerFolderHandlers } from './folders';
import { registerUIStateHandlers } from './uiState';
import { registerDashboardHandlers } from './dashboard';
import { registerCommitModeHandlers } from './commitMode';
import { setupLogHandlers } from './logs';
import { registerPanelHandlers } from './panels';
import { registerClaudePanelHandlers } from './claudePanel';
import { registerCodexPanelHandlers } from './codexPanel';
import { registerEditorPanelHandlers } from './editorPanel';
import { registerProviderHandlers } from './provider';


export function registerIpcHandlers(services: AppServices): void {
  registerAppHandlers(ipcMain, services);
  registerUpdaterHandlers(ipcMain, services);
  registerSessionHandlers(ipcMain, services);
  registerProjectHandlers(ipcMain, services);
  registerConfigHandlers(ipcMain, services);
  registerDialogHandlers(ipcMain, services);
  registerGitHandlers(ipcMain, services);
  registerScriptHandlers(ipcMain, services);
  registerPromptHandlers(ipcMain, services);
  registerStravuHandlers(ipcMain, services);
  registerFileHandlers(ipcMain, services);
  registerFolderHandlers(ipcMain, services);
  registerUIStateHandlers(services);
  registerDashboardHandlers(ipcMain, services);
  registerCommitModeHandlers(services.databaseService, services.logger, services.sessionManager);
  setupLogHandlers(services.sessionManager);
  registerPanelHandlers(ipcMain, services);
  registerClaudePanelHandlers(ipcMain, services);
  registerCodexPanelHandlers(ipcMain, services);
  registerEditorPanelHandlers(ipcMain, services);
  registerProviderHandlers(ipcMain, services);
} 