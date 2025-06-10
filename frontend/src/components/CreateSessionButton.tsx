import { useState } from 'react';
import { CreateSessionDialog } from './CreateSessionDialog';
import { API } from '../utils/api';

export function CreateSessionButton() {
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = async () => {
    try {
      // Check if there's an active project
      const response = await API.projects.getActive();
      
      if (!response.success || !response.data) {
        // No active project, show alert
        alert('Please select or create a project first before creating a session.');
        return;
      }
      
      // Active project exists, open the dialog
      setIsOpen(true);
    } catch (error) {
      console.error('Error checking active project:', error);
      alert('Error checking project status. Please try again.');
    }
  };
  
  return (
    <>
      <button
        onClick={handleClick}
        data-testid="create-session-button"
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
      >
        New Session
      </button>
      
      <CreateSessionDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}