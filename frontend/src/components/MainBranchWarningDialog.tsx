import { Plus } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';

interface MainBranchWarningDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  projectName: string;
  projectId: number;
  mainBranch: string;
}

export function MainBranchWarningDialog({ 
  isOpen, 
  onClose, 
  onContinue, 
  projectName, 
  projectId,
  mainBranch 
}: MainBranchWarningDialogProps) {
  const handleDontShowAgain = () => {
    const warningKey = `mainBranchWarning_${projectId}`;
    localStorage.setItem(warningKey, 'true');
    onContinue();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" showCloseButton={false}>
      <ModalHeader title={`Working in the ${mainBranch} branch`} onClose={onClose} />
        
      <ModalBody className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-interactive text-2xl mt-1">💡</span>
            <div className="flex-1">
              <p className="text-text-secondary mb-3">
                You're about to create a session in the <span className="font-mono bg-surface-secondary px-1 rounded">{mainBranch}</span> branch 
                of <span className="font-medium">{projectName}</span>.
              </p>
              <p className="text-text-secondary mb-3">
                For better workflow management, it's recommended to create worktrees instead. This allows you to:
              </p>
              <ul className="list-disc list-inside text-text-secondary space-y-1 mb-4">
                <li>Run multiple sessions in parallel without conflicts</li>
                <li>Keep your main branch clean</li>
                <li>Easily manage and compare different approaches</li>
                <li>Avoid creating more commits than intended in your main branch</li>
              </ul>
              <div className="bg-status-warning/10 border border-status-warning/30 rounded-md p-3 mb-3">
                <p className="text-sm text-status-warning">
                  <span className="font-medium">⚠️ Note:</span> Working directly in the {mainBranch} branch may result in 
                  multiple intermediate commits as Claude makes changes. Using worktrees allows you to squash 
                  these into a single clean commit before merging.
                </p>
              </div>
              <div className="bg-interactive/10 border border-interactive/30 rounded-md p-3">
                <p className="text-sm text-interactive">
                  <span className="font-medium">Tip:</span> Click the <Plus className="w-4 h-4 inline mx-1" /> button 
                  next to the project name to create a new worktree session.
                </p>
              </div>
            </div>
          </div>
      </ModalBody>
        
      <ModalFooter>
        <div className="w-full space-y-2">
          <div className="flex gap-3">
            <Button
              onClick={onContinue}
              variant="secondary"
              fullWidth
            >
              Continue to {mainBranch} branch
            </Button>
            <Button
              onClick={handleDontShowAgain}
              variant="primary"
              fullWidth
            >
              Continue and don't ask again
            </Button>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            fullWidth
          >
            Cancel
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
}