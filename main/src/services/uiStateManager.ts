import { DatabaseService } from '../database/database';

interface UIState {
  treeView: {
    expandedProjects: number[];
    expandedFolders: string[];
    expandedGroups: number[];
    sessionSortAscending: boolean;
  };
}

class UIStateManager {
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  getExpandedProjects(): number[] {
    const value = this.db.getUIState('treeView.expandedProjects');
    if (!value) return [];
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }

  getExpandedFolders(): string[] {
    const value = this.db.getUIState('treeView.expandedFolders');
    if (!value) return [];
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }

  getExpandedGroups(): number[] {
    const value = this.db.getUIState('treeView.expandedGroups');
    if (!value) return [];
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }

  getSessionSortAscending(): boolean {
    const value = this.db.getUIState('treeView.sessionSortAscending');
    if (!value) return false; // Default to descending (newest first)
    try {
      return JSON.parse(value);
    } catch {
      return false;
    }
  }

  saveExpandedProjects(projectIds: number[]): void {
    this.db.setUIState('treeView.expandedProjects', JSON.stringify(projectIds));
  }

  saveExpandedFolders(folderIds: string[]): void {
    this.db.setUIState('treeView.expandedFolders', JSON.stringify(folderIds));
  }

  saveExpandedGroups(groupIds: number[]): void {
    this.db.setUIState('treeView.expandedGroups', JSON.stringify(groupIds));
  }

  saveSessionSortAscending(ascending: boolean): void {
    this.db.setUIState('treeView.sessionSortAscending', JSON.stringify(ascending));
  }

  saveExpandedState(projectIds: number[], folderIds: string[], groupIds: number[]): void {
    this.saveExpandedProjects(projectIds);
    this.saveExpandedFolders(folderIds);
    this.saveExpandedGroups(groupIds);
  }

  getExpandedState(): { expandedProjects: number[]; expandedFolders: string[]; expandedGroups: number[]; sessionSortAscending: boolean } {
    return {
      expandedProjects: this.getExpandedProjects(),
      expandedFolders: this.getExpandedFolders(),
      expandedGroups: this.getExpandedGroups(),
      sessionSortAscending: this.getSessionSortAscending()
    };
  }

  clear(): void {
    this.db.deleteUIState('treeView.expandedProjects');
    this.db.deleteUIState('treeView.expandedFolders');
    this.db.deleteUIState('treeView.expandedGroups');
    this.db.deleteUIState('treeView.sessionSortAscending');
  }
}

export { UIStateManager };