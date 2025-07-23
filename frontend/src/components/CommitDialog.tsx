import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GitCommit } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';
import { Textarea } from './ui/Textarea';

interface CommitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCommit: (message: string) => Promise<void>;
  fileCount: number;
}

export const CommitDialog: React.FC<CommitDialogProps> = ({
  isOpen,
  onClose,
  onCommit,
  fileCount
}) => {
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Set default message
  useEffect(() => {
    if (isOpen) {
      const defaultMessage = `Update ${fileCount} file${fileCount > 1 ? 's' : ''}`;
      setCommitMessage(defaultMessage);
      setError(null);
      // Focus and select all text after a short delay
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.select();
        }
      }, 100);
    }
  }, [isOpen, fileCount]);

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) {
      setError('Please enter a commit message');
      return;
    }

    setIsCommitting(true);
    setError(null);

    try {
      await onCommit(commitMessage);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit changes');
    } finally {
      setIsCommitting(false);
    }
  }, [commitMessage, onCommit, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleCommit();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [handleCommit, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <ModalHeader 
        icon={<GitCommit className="w-5 h-5" />}
        title="Commit Changes"
        onClose={onClose}
      />
      
      <ModalBody>
        <p className="text-sm text-text-secondary mb-4">
          Committing {fileCount} file{fileCount > 1 ? 's' : ''} with changes
        </p>
        
        <Textarea
          ref={textareaRef}
          value={commitMessage}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCommitMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter commit message..."
          rows={4}
          error={error}
        />
        
        <p className="mt-2 text-xs text-text-tertiary">
          Press Ctrl+Enter (Cmd+Enter on Mac) to commit
        </p>
      </ModalBody>

      <ModalFooter>
        <Button
          onClick={onClose}
          disabled={isCommitting}
          variant="secondary"
        >
          Cancel
        </Button>
        <Button
          onClick={handleCommit}
          disabled={isCommitting || !commitMessage.trim()}
          variant="primary"
          loading={isCommitting}
          loadingText="Committing..."
        >
          <GitCommit className="w-4 h-4" />
          Commit
        </Button>
      </ModalFooter>
    </Modal>
  );
};