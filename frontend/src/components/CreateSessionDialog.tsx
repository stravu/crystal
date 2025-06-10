import { useState, useEffect } from 'react';
import { API } from '../utils/api';
import type { CreateSessionRequest } from '../types/session';
import { useErrorStore } from '../stores/errorStore';
import { Shield, ShieldOff } from 'lucide-react';

interface CreateSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateSessionDialog({ isOpen, onClose }: CreateSessionDialogProps) {
  const [formData, setFormData] = useState<CreateSessionRequest>({
    prompt: '',
    worktreeTemplate: '',
    count: 1,
    permissionMode: 'ignore'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showError } = useErrorStore();
  
  useEffect(() => {
    if (isOpen) {
      // Fetch the default permission mode when dialog opens
      API.config.get().then(response => {
        if (response.success && response.data?.defaultPermissionMode) {
          setFormData(prev => ({
            ...prev,
            permissionMode: response.data.defaultPermissionMode
          }));
        }
      }).catch(err => {
        console.error('Failed to fetch default permission mode:', err);
      });
    }
  }, [isOpen]);
  
  if (!isOpen) return null;
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const response = await API.sessions.create(formData);
      
      if (!response.success) {
        showError({
          title: 'Failed to Create Session',
          error: response.error || 'An error occurred while creating the session.',
          details: response.details,
          command: response.command
        });
        return;
      }
      
      onClose();
      // Reset form but fetch the default permission mode again
      const configResponse = await API.config.get();
      const defaultPermissionMode = configResponse.success && configResponse.data?.defaultPermissionMode 
        ? configResponse.data.defaultPermissionMode 
        : 'ignore';
      setFormData({ prompt: '', worktreeTemplate: '', count: 1, permissionMode: defaultPermissionMode });
    } catch (error: any) {
      console.error('Error creating session:', error);
      showError({
        title: 'Failed to Create Session',
        error: error.message || 'An error occurred while creating the session.',
        details: error.stack || error.toString()
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div data-testid="create-session-dialog" className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Create New Session</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-1">
              Prompt
            </label>
            <textarea
              id="prompt"
              value={formData.prompt}
              onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              rows={4}
              required
              placeholder="Enter the prompt for Claude Code..."
            />
          </div>
          
          <div>
            <label htmlFor="worktreeTemplate" className="block text-sm font-medium text-gray-700 mb-1">
              Worktree Name Template (Optional)
            </label>
            <input
              id="worktreeTemplate"
              type="text"
              value={formData.worktreeTemplate}
              onChange={(e) => setFormData({ ...formData, worktreeTemplate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              placeholder="Leave empty for auto-generated name"
            />
            <p className="text-xs text-gray-500 mt-1">
              Names are auto-generated using AI based on your prompt. You can override by entering a custom name.
            </p>
          </div>
          
          <div>
            <label htmlFor="count" className="block text-sm font-medium text-gray-700 mb-1">
              Number of Sessions
            </label>
            <input
              id="count"
              type="number"
              min="1"
              max="10"
              value={formData.count}
              onChange={(e) => setFormData({ ...formData, count: parseInt(e.target.value) || 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
            <p className="text-xs text-gray-500 mt-1">
              Creates multiple sessions with numbered suffixes
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Permission Mode
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="permissionMode"
                  value="ignore"
                  checked={formData.permissionMode === 'ignore' || !formData.permissionMode}
                  onChange={(e) => setFormData({ ...formData, permissionMode: e.target.value as 'ignore' | 'approve' })}
                  className="text-blue-600"
                />
                <div className="flex items-center gap-2">
                  <ShieldOff className="w-4 h-4 text-gray-600" />
                  <span className="text-sm text-gray-900">Skip Permissions</span>
                  <span className="text-xs text-gray-500">(faster, less secure)</span>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="permissionMode"
                  value="approve"
                  checked={formData.permissionMode === 'approve'}
                  onChange={(e) => setFormData({ ...formData, permissionMode: e.target.value as 'ignore' | 'approve' })}
                  className="text-blue-600"
                />
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-gray-900">Manual Approval</span>
                  <span className="text-xs text-gray-500">(safer, interactive)</span>
                </div>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              When enabled, Claude will ask for permission before performing potentially dangerous actions.
            </p>
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}