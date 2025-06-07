import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  
  onSessionUpdate: (callback: (data: any) => void) => {
    ipcRenderer.on('session-update', (_event, data) => callback(data));
  },
  
  onTerminalOutput: (callback: (data: any) => void) => {
    ipcRenderer.on('terminal-output', (_event, data) => callback(data));
  },
  
  sendInput: (sessionId: string, input: string) => {
    ipcRenderer.send('session-input', { sessionId, input });
  },
  
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
});