import { useState } from 'react';
import { CreateSessionDialog } from './CreateSessionDialog';

export function CreateSessionButton() {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
      >
        New Session
      </button>
      
      <CreateSessionDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}