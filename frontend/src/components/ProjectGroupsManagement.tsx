import { useState, useEffect } from 'react';
import { X, Plus, Edit2, Trash2, Users, FolderGit2 } from 'lucide-react';
import type { ProjectGroup, ProjectGroupMember, Project } from '../types/project';

interface ProjectGroupsManagementProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProjectGroupsManagement({ isOpen, onClose }: ProjectGroupsManagementProps) {
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ProjectGroup | null>(null);
  const [groupMembers, setGroupMembers] = useState<ProjectGroupMember[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    system_prompt: ''
  });

  // Load groups and projects
  useEffect(() => {
    if (isOpen) {
      loadGroups();
      loadProjects();
    }
  }, [isOpen]);

  // Load members when a group is selected
  useEffect(() => {
    if (selectedGroup) {
      loadGroupMembers(selectedGroup.id);
    }
  }, [selectedGroup]);

  const loadGroups = async () => {
    try {
      const response = await window.electronAPI.projectGroups.getAll();
      if (response.success && response.data) {
        setGroups(response.data as ProjectGroup[]);
      }
    } catch (error) {
      console.error('Failed to load project groups:', error);
    }
  };

  const loadProjects = async () => {
    try {
      const response = await window.electronAPI.projects.getAll();
      if (response.success && response.data) {
        setProjects(response.data as Project[]);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadGroupMembers = async (groupId: number) => {
    try {
      const response = await window.electronAPI.projectGroups.getMembers(groupId);
      if (response.success && response.data) {
        setGroupMembers(response.data as ProjectGroupMember[]);
      }
    } catch (error) {
      console.error('Failed to load group members:', error);
    }
  };

  const handleCreateGroup = async () => {
    if (!formData.name.trim()) return;

    setLoading(true);
    try {
      const response = await window.electronAPI.projectGroups.create({
        name: formData.name,
        description: formData.description || undefined,
        system_prompt: formData.system_prompt || undefined
      });

      if (response.success) {
        await loadGroups();
        setIsCreating(false);
        setFormData({ name: '', description: '', system_prompt: '' });
      }
    } catch (error) {
      console.error('Failed to create group:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateGroup = async () => {
    if (!selectedGroup) return;

    setLoading(true);
    try {
      const response = await window.electronAPI.projectGroups.update(selectedGroup.id, {
        name: formData.name,
        description: formData.description || null,
        system_prompt: formData.system_prompt || null
      });

      if (response.success) {
        await loadGroups();
        setIsEditing(false);
        setSelectedGroup(response.data as ProjectGroup);
      }
    } catch (error) {
      console.error('Failed to update group:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId: number) => {
    if (!confirm('Are you sure you want to delete this project group? Projects in the group will not be deleted.')) {
      return;
    }

    try {
      const response = await window.electronAPI.projectGroups.delete(groupId);
      if (response.success) {
        await loadGroups();
        if (selectedGroup?.id === groupId) {
          setSelectedGroup(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete group:', error);
    }
  };

  const handleAddProject = async (projectId: number) => {
    if (!selectedGroup) return;

    try {
      const response = await window.electronAPI.projectGroups.addProject({
        group_id: selectedGroup.id,
        project_id: projectId,
        include_in_context: true
      });

      if (response.success) {
        await loadGroupMembers(selectedGroup.id);
      }
    } catch (error) {
      console.error('Failed to add project to group:', error);
    }
  };

  const handleRemoveProject = async (projectId: number) => {
    if (!selectedGroup) return;

    try {
      const response = await window.electronAPI.projectGroups.removeProject(selectedGroup.id, projectId);
      if (response.success) {
        await loadGroupMembers(selectedGroup.id);
      }
    } catch (error) {
      console.error('Failed to remove project from group:', error);
    }
  };

  const handleToggleIncludeInContext = async (member: ProjectGroupMember) => {
    try {
      const response = await window.electronAPI.projectGroups.updateMember(member.id, {
        include_in_context: !member.include_in_context
      });

      if (response.success && selectedGroup) {
        await loadGroupMembers(selectedGroup.id);
      }
    } catch (error) {
      console.error('Failed to update member:', error);
    }
  };

  const handleUpdateRole = async (member: ProjectGroupMember, roleDescription: string) => {
    try {
      const response = await window.electronAPI.projectGroups.updateMember(member.id, {
        role_description: roleDescription || null
      });

      if (response.success && selectedGroup) {
        await loadGroupMembers(selectedGroup.id);
      }
    } catch (error) {
      console.error('Failed to update role:', error);
    }
  };

  const startEditing = (group: ProjectGroup) => {
    setFormData({
      name: group.name,
      description: group.description || '',
      system_prompt: group.system_prompt || ''
    });
    setIsEditing(true);
  };

  const availableProjects = projects.filter(
    project => !groupMembers.some(member => member.project_id === project.id)
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <FolderGit2 className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-semibold text-white">Project Groups</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Groups List */}
          <div className="w-1/3 border-r border-gray-700 flex flex-col">
            <div className="p-4 border-b border-gray-700">
              <button
                onClick={() => {
                  setIsCreating(true);
                  setIsEditing(false);
                  setSelectedGroup(null);
                  setFormData({ name: '', description: '', system_prompt: '' });
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Group
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {groups.map(group => (
                <div
                  key={group.id}
                  className={`p-3 rounded cursor-pointer transition-colors ${
                    selectedGroup?.id === group.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 hover:bg-gray-750 text-gray-200'
                  }`}
                  onClick={() => {
                    setSelectedGroup(group);
                    setIsCreating(false);
                    setIsEditing(false);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span className="font-medium">{group.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedGroup(group);
                          startEditing(group);
                          setIsCreating(false);
                        }}
                        className="p-1 hover:bg-gray-700 rounded"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGroup(group.id);
                        }}
                        className="p-1 hover:bg-red-600 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {group.description && (
                    <p className="text-xs mt-1 opacity-75">{group.description}</p>
                  )}
                </div>
              ))}
              {groups.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  No project groups yet.
                  <br />
                  Create one to get started!
                </div>
              )}
            </div>
          </div>

          {/* Details Panel */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {(isCreating || isEditing) && (
              <div className="p-6 space-y-4 overflow-y-auto">
                <h3 className="text-lg font-semibold text-white">
                  {isCreating ? 'Create New Group' : 'Edit Group'}
                </h3>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Group Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white focus:border-blue-500 focus:outline-none"
                    placeholder="e.g., librescoot, my-microservices"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white focus:border-blue-500 focus:outline-none"
                    placeholder="Brief description of this project group"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    System Prompt
                  </label>
                  <textarea
                    value={formData.system_prompt}
                    onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                    rows={6}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white focus:border-blue-500 focus:outline-none font-mono text-sm"
                    placeholder="Group-level system prompt for all sessions in this group's projects..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This prompt will be added to all AI sessions in projects within this group
                  </p>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={isCreating ? handleCreateGroup : handleUpdateGroup}
                    disabled={loading || !formData.name.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Saving...' : isCreating ? 'Create Group' : 'Update Group'}
                  </button>
                  <button
                    onClick={() => {
                      setIsCreating(false);
                      setIsEditing(false);
                      setFormData({ name: '', description: '', system_prompt: '' });
                    }}
                    className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!isCreating && !isEditing && selectedGroup && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-6 border-b border-gray-700">
                  <h3 className="text-lg font-semibold text-white">{selectedGroup.name}</h3>
                  {selectedGroup.description && (
                    <p className="text-sm text-gray-400 mt-1">{selectedGroup.description}</p>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Projects in Group */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-300 mb-3">Projects in Group</h4>
                    <div className="space-y-2">
                      {groupMembers.map(member => {
                        const project = projects.find(p => p.id === member.project_id);
                        if (!project) return null;

                        return (
                          <div
                            key={member.id}
                            className="flex items-center gap-3 p-3 bg-gray-800 rounded"
                          >
                            <input
                              type="checkbox"
                              checked={member.include_in_context}
                              onChange={() => handleToggleIncludeInContext(member)}
                              className="w-4 h-4"
                              title="Include in context via --add-dir"
                            />
                            <div className="flex-1">
                              <div className="font-medium text-white">{project.name}</div>
                              <input
                                type="text"
                                value={member.role_description || ''}
                                onChange={(e) => handleUpdateRole(member, e.target.value)}
                                placeholder="Role description (e.g., Frontend UI, API service)"
                                className="w-full mt-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-gray-300 focus:border-blue-500 focus:outline-none"
                              />
                            </div>
                            <button
                              onClick={() => handleRemoveProject(project.id)}
                              className="p-2 text-red-400 hover:bg-red-600 hover:text-white rounded transition-colors"
                              title="Remove from group"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                      {groupMembers.length === 0 && (
                        <div className="text-center text-gray-500 py-4">
                          No projects in this group yet
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Available Projects */}
                  {availableProjects.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-300 mb-3">Add Projects</h4>
                      <div className="space-y-2">
                        {availableProjects.map(project => (
                          <div
                            key={project.id}
                            className="flex items-center justify-between p-3 bg-gray-800 rounded hover:bg-gray-750 transition-colors"
                          >
                            <div>
                              <div className="font-medium text-white">{project.name}</div>
                              <div className="text-xs text-gray-500">{project.path}</div>
                            </div>
                            <button
                              onClick={() => handleAddProject(project.id)}
                              className="p-2 text-blue-400 hover:bg-blue-600 hover:text-white rounded transition-colors"
                              title="Add to group"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!isCreating && !isEditing && !selectedGroup && (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Select a group to view details</p>
                  <p className="text-sm mt-2">or create a new group to get started</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
