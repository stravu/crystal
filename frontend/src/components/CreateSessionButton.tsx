import { useState } from 'react';
import { CreateSessionDialog } from './CreateSessionDialog';
import { API } from '../utils/api';
import { Button } from './ui/Button';

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
      <Button
        onClick={handleClick}
        data-testid="create-session-button"
        variant="primary"
        fullWidth
      >
        New Session
      </Button>
      
      <CreateSessionDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}