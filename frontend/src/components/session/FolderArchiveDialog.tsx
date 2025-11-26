import React from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { Button } from '../ui/Button';
import { FolderArchive } from 'lucide-react';

interface FolderArchiveDialogProps {
  isOpen: boolean;
  sessionCount: number;
  onArchiveSessionOnly: () => void;
  onArchiveEntireFolder: () => void;
  onCancel: () => void;
}

export const FolderArchiveDialog: React.FC<FolderArchiveDialogProps> = ({
  isOpen,
  sessionCount,
  onArchiveSessionOnly,
  onArchiveEntireFolder,
  onCancel,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} size="md">
      <ModalHeader>
        <div className="flex items-center gap-2">
          <FolderArchive className="w-5 h-5 text-text-secondary" />
          Archive Folder?
        </div>
      </ModalHeader>

      <ModalBody>
        <p className="text-text-secondary">
          This session is in a folder with {sessionCount} session{sessionCount !== 1 ? 's' : ''}.
          Would you like to archive all sessions in the folder?
        </p>
      </ModalBody>

      <ModalFooter className="flex justify-end gap-3">
        <Button onClick={onCancel} variant="ghost">
          Cancel
        </Button>
        <Button onClick={onArchiveSessionOnly} variant="secondary">
          This Session Only
        </Button>
        <Button onClick={onArchiveEntireFolder}>
          Archive Entire Folder
        </Button>
      </ModalFooter>
    </Modal>
  );
};
