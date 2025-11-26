import React from 'react';
import { GitCommands } from '../../types/session';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Checkbox, Textarea } from '../ui/Input';
import { Card } from '../ui/Card';

interface CommitMessageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  dialogType: 'squash' | 'rebase';
  gitCommands: GitCommands | null;
  commitMessage: string;
  setCommitMessage: (message: string) => void;
  shouldSquash: boolean;
  setShouldSquash: (should: boolean) => void;
  onConfirm: (message: string) => void;
  onMergeAndArchive?: (message: string) => void;
  isMerging: boolean;
  isMergingAndArchiving?: boolean;
}

export const CommitMessageDialog: React.FC<CommitMessageDialogProps> = ({
  isOpen,
  onClose,
  dialogType,
  gitCommands,
  commitMessage,
  setCommitMessage,
  shouldSquash,
  setShouldSquash,
  onConfirm,
  onMergeAndArchive,
  isMerging,
  isMergingAndArchiving,
}) => {
  const isProcessing = isMerging || isMergingAndArchiving;
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalHeader>
        {dialogType === 'squash'
          ? `Merge to ${gitCommands?.mainBranch || 'Main'}`
          : `Rebase from ${gitCommands?.mainBranch || 'Main'}`
        }
      </ModalHeader>
      
      <ModalBody>
          <div className="space-y-4">
            {dialogType === 'squash' && (
              <Card variant="bordered" padding="md" className="bg-surface-secondary">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="shouldSquash"
                    label="Squash commits into one"
                    checked={shouldSquash}
                    onChange={(e) => setShouldSquash(e.target.checked)}
                    className="flex-1"
                  />
                  <div className="text-sm text-text-secondary ml-6">
                    {shouldSquash ? "Combine all commits into a single commit before merging" : "Keep all commits and preserve history"}
                  </div>
                </div>
              </Card>
            )}
            
            <Textarea
              label="Commit Message"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              rows={8}
              disabled={dialogType === 'squash' && !shouldSquash}
              placeholder={dialogType === 'squash' ? (shouldSquash ? "Enter commit message..." : "Not needed when preserving commits") : "Enter commit message..."}
              helperText={
                dialogType === 'squash'
                  ? (shouldSquash
                      ? `This message will be used for the merge commit.`
                      : `Original commit messages will be preserved when merging.`)
                  : `This message will be used when rebasing.`
              }
              fullWidth
              className="font-mono text-sm"
            />

            {dialogType === 'squash' && (
              <Card variant="bordered" padding="md" className="bg-surface-secondary">
                <h4 className="text-sm font-medium text-text-primary mb-2">Git commands to be executed:</h4>
                <div className="space-y-1">
                  {shouldSquash ? (
                    gitCommands?.squashCommands?.map((cmd, idx) => (
                      <Card key={idx} variant="bordered" padding="sm" className="bg-surface-tertiary text-text-primary font-mono text-xs">
                        {cmd}
                      </Card>
                    ))
                  ) : (
                    gitCommands?.mergeCommands?.map((cmd, idx) => (
                      <Card key={idx} variant="bordered" padding="sm" className="bg-surface-tertiary text-text-primary font-mono text-xs">
                        {cmd}
                      </Card>
                    ))
                  )}
                </div>
              </Card>
            )}
          </div>
      </ModalBody>
      
      <ModalFooter className="flex justify-end gap-3">
        <Button onClick={onClose} variant="ghost" disabled={isProcessing}>
          Cancel
        </Button>
        {dialogType === 'squash' && onMergeAndArchive && (
          <Button
            onClick={() => onMergeAndArchive(commitMessage)}
            disabled={(shouldSquash && !commitMessage.trim()) || isProcessing}
            loading={isMergingAndArchiving}
            variant="secondary"
          >
            {isMergingAndArchiving ? 'Merging...' : 'Merge & Archive'}
          </Button>
        )}
        <Button
          onClick={() => onConfirm(commitMessage)}
          disabled={(shouldSquash && !commitMessage.trim()) || isProcessing}
          loading={isMerging}
        >
          {isMerging ? 'Merging...' : (dialogType === 'squash' ? 'Merge' : 'Rebase')}
        </Button>
      </ModalFooter>
    </Modal>
  );
}; 