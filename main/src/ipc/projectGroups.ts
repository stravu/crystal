import { IpcMain } from 'electron';
import type { AppServices } from './types';
import type { CreateProjectGroupRequest, UpdateProjectGroupRequest, AddProjectToGroupRequest } from '../../../frontend/src/types/project';

export function registerProjectGroupHandlers(ipcMain: IpcMain, services: AppServices): void {
  const { databaseService } = services;

  // Get all project groups
  ipcMain.handle('project-groups:get-all', async () => {
    try {
      const groups = databaseService.getAllProjectGroups();
      return { success: true, data: groups };
    } catch (error) {
      console.error('Failed to get project groups:', error);
      return { success: false, error: 'Failed to get project groups' };
    }
  });

  // Get all project groups with their projects
  ipcMain.handle('project-groups:get-all-with-projects', async () => {
    try {
      const groupsWithProjects = databaseService.getAllProjectGroupsWithProjects();
      return { success: true, data: groupsWithProjects };
    } catch (error) {
      console.error('Failed to get project groups with projects:', error);
      return { success: false, error: 'Failed to get project groups with projects' };
    }
  });

  // Get a specific project group
  ipcMain.handle('project-groups:get', async (_event, groupId: number) => {
    try {
      const group = databaseService.getProjectGroup(groupId);
      if (!group) {
        return { success: false, error: 'Project group not found' };
      }
      return { success: true, data: group };
    } catch (error) {
      console.error('Failed to get project group:', error);
      return { success: false, error: 'Failed to get project group' };
    }
  });

  // Create a new project group
  ipcMain.handle('project-groups:create', async (_event, groupData: CreateProjectGroupRequest) => {
    try {
      console.log('[Main] Creating project group:', groupData);
      const group = databaseService.createProjectGroup(
        groupData.name,
        groupData.description,
        groupData.system_prompt
      );
      console.log('[Main] Project group created:', group);
      return { success: true, data: group };
    } catch (error) {
      console.error('Failed to create project group:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create project group'
      };
    }
  });

  // Update a project group
  ipcMain.handle('project-groups:update', async (_event, groupId: number, updates: UpdateProjectGroupRequest) => {
    try {
      console.log('[Main] Updating project group:', groupId, updates);
      const group = databaseService.updateProjectGroup(groupId, updates);
      if (!group) {
        return { success: false, error: 'Project group not found' };
      }
      console.log('[Main] Project group updated:', group);
      return { success: true, data: group };
    } catch (error) {
      console.error('Failed to update project group:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update project group'
      };
    }
  });

  // Delete a project group
  ipcMain.handle('project-groups:delete', async (_event, groupId: number) => {
    try {
      console.log('[Main] Deleting project group:', groupId);
      const success = databaseService.deleteProjectGroup(groupId);
      if (!success) {
        return { success: false, error: 'Project group not found' };
      }
      console.log('[Main] Project group deleted');
      return { success: true };
    } catch (error) {
      console.error('Failed to delete project group:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete project group'
      };
    }
  });

  // Get members of a project group
  ipcMain.handle('project-groups:get-members', async (_event, groupId: number) => {
    try {
      const members = databaseService.getProjectGroupMembers(groupId);
      return { success: true, data: members };
    } catch (error) {
      console.error('Failed to get project group members:', error);
      return { success: false, error: 'Failed to get project group members' };
    }
  });

  // Get project group for a specific project
  ipcMain.handle('project-groups:get-for-project', async (_event, projectId: number) => {
    try {
      const groupInfo = databaseService.getProjectGroupForProject(projectId);
      return { success: true, data: groupInfo };
    } catch (error) {
      console.error('Failed to get project group for project:', error);
      return { success: false, error: 'Failed to get project group for project' };
    }
  });

  // Add a project to a group
  ipcMain.handle('project-groups:add-project', async (_event, data: AddProjectToGroupRequest) => {
    try {
      console.log('[Main] Adding project to group:', data);
      const member = databaseService.addProjectToGroup(
        data.group_id,
        data.project_id,
        data.include_in_context ?? true,
        data.role_description
      );
      console.log('[Main] Project added to group:', member);
      return { success: true, data: member };
    } catch (error) {
      console.error('Failed to add project to group:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add project to group'
      };
    }
  });

  // Remove a project from a group
  ipcMain.handle('project-groups:remove-project', async (_event, groupId: number, projectId: number) => {
    try {
      console.log('[Main] Removing project from group:', groupId, projectId);
      const success = databaseService.removeProjectFromGroup(groupId, projectId);
      if (!success) {
        return { success: false, error: 'Project not found in group' };
      }
      console.log('[Main] Project removed from group');
      return { success: true };
    } catch (error) {
      console.error('Failed to remove project from group:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove project from group'
      };
    }
  });

  // Update a project group member
  ipcMain.handle('project-groups:update-member', async (_event, memberId: number, updates: { include_in_context?: boolean; role_description?: string | null; display_order?: number }) => {
    try {
      console.log('[Main] Updating project group member:', memberId, updates);
      const member = databaseService.updateProjectGroupMember(memberId, updates);
      if (!member) {
        return { success: false, error: 'Project group member not found' };
      }
      console.log('[Main] Project group member updated:', member);
      return { success: true, data: member };
    } catch (error) {
      console.error('Failed to update project group member:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update project group member'
      };
    }
  });
}
