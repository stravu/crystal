import React from 'react';
import { GitErrorDetails } from '../../types/session';
import { sanitizeGitOutput } from '../../utils/sanitizer';
import { Button } from '../ui/Button';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { Card } from '../ui/Card';
import { AlertCircle, FileText, Info, Copy, CheckCircle } from 'lucide-react';

interface GitErrorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  errorDetails: GitErrorDetails | null;
  getGitErrorTips: (errorDetails: GitErrorDetails) => string[];
  onAbortAndUseClaude: () => void;
}

export const GitErrorDialog: React.FC<GitErrorDialogProps> = ({
  isOpen,
  onClose,
  errorDetails,
  getGitErrorTips,
  onAbortAndUseClaude,
}) => {
  if (!errorDetails) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalHeader className="bg-status-error/10">
        <div className="flex items-center space-x-3">
          <AlertCircle className="w-6 h-6 text-status-error" />
          <span className="text-status-error">{errorDetails.title}</span>
        </div>
      </ModalHeader>

      <ModalBody>
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-text-tertiary mb-2">Error Message</h3>
              <Card variant="bordered" padding="sm" className="bg-status-error/10 border-status-error/30">
                <p className="text-status-error text-sm">{errorDetails.message}</p>
              </Card>
            </div>

            {errorDetails.conflictingFiles && errorDetails.conflictingFiles.length > 0 && (
              <Card variant="bordered" className="border-2 border-status-warning/30 bg-status-warning/10">
                <h3 className="text-base font-semibold text-status-warning mb-3 flex items-center">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  Conflicting Files
                </h3>
                <Card variant="bordered" padding="md" className="bg-surface-tertiary">
                  <ul className="text-sm font-mono space-y-1">
                    {errorDetails.conflictingFiles.map((file, idx) => (
                      <li key={idx} className="text-text-primary">• {file}</li>
                    ))}
                  </ul>
                </Card>
              </Card>
            )}

            {errorDetails.conflictingCommits && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {errorDetails.conflictingCommits.ours.length > 0 && (
                  <Card variant="bordered" className="border-interactive/30 bg-interactive/10">
                    <h4 className="text-sm font-semibold text-interactive-on-dark mb-2">Your Commits</h4>
                    <div className="text-xs font-mono space-y-1 max-h-32 overflow-y-auto">
                      {errorDetails.conflictingCommits.ours.map((commit, idx) => (
                        <div key={idx} className="text-interactive-on-dark/80">{commit}</div>
                      ))}
                    </div>
                  </Card>
                )}
                {errorDetails.conflictingCommits.theirs.length > 0 && (
                  <Card variant="bordered" className="border-status-success/30 bg-status-success/10">
                    <h4 className="text-sm font-semibold text-status-success-hover mb-2">Incoming Commits</h4>
                    <div className="text-xs font-mono space-y-1 max-h-32 overflow-y-auto">
                      {errorDetails.conflictingCommits.theirs.map((commit, idx) => (
                        <div key={idx} className="text-status-success-hover/80">{commit}</div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}

            <Card variant="bordered" className="border-2 border-status-error/30 bg-status-error/10">
              <h3 className="text-base font-semibold text-status-error mb-3 flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                Git Output
              </h3>
              <Card variant="bordered" padding="md" className="bg-surface-tertiary text-text-primary max-h-96 overflow-y-auto">
                <pre className="text-sm whitespace-pre-wrap font-mono">{sanitizeGitOutput(errorDetails.output || 'No output available')}</pre>
              </Card>
            </Card>

            {errorDetails.workingDirectory && (
              <div>
                <h3 className="text-sm font-medium text-text-tertiary mb-2">Working Directory</h3>
                <Card variant="bordered" padding="sm" className="bg-surface-secondary">
                  <p className="text-text-primary text-sm font-mono">{errorDetails.workingDirectory}</p>
                </Card>
              </div>
            )}

            {errorDetails.projectPath && (
              <div>
                <h3 className="text-sm font-medium text-text-tertiary mb-2">Project Path</h3>
                <Card variant="bordered" padding="sm" className="bg-surface-secondary">
                  <p className="text-text-primary text-sm font-mono">{errorDetails.projectPath}</p>
                </Card>
              </div>
            )}

            {(errorDetails.command || errorDetails.commands) && (
              <div>
                <h3 className="text-sm font-medium text-text-tertiary mb-2">
                  {errorDetails.commands ? 'Git Commands Executed' : 'Git Command'}
                </h3>
                <div className="space-y-2">
                  {errorDetails.command && (
                    <Card variant="bordered" padding="sm" className="bg-surface-tertiary text-text-primary">
                      <p className="font-mono text-sm">{errorDetails.command}</p>
                    </Card>
                  )}
                  {errorDetails.commands && errorDetails.commands.map((cmd, idx) => (
                    <Card key={idx} variant="bordered" padding="sm" className="bg-surface-tertiary text-text-primary">
                      <p className="font-mono text-sm">{cmd}</p>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            <Card variant="bordered" className="bg-interactive/10 border-interactive/30">
              <div className="flex items-start space-x-2">
                <Info className="w-5 h-5 text-interactive-on-dark mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-interactive-on-dark mb-1">Troubleshooting Tips</h4>
                  <ul className="text-sm text-interactive-on-dark/80 space-y-1">
                    {getGitErrorTips(errorDetails).map((tip, idx) => <li key={idx}>{tip}</li>)}
                  </ul>
                </div>
              </div>
            </Card>
          </div>
      </ModalBody>

      <ModalFooter className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          {(errorDetails.isRebaseConflict || errorDetails.hasConflicts) && (
            <Button onClick={onAbortAndUseClaude} className="bg-status-success hover:bg-status-success-hover">
              <CheckCircle className="w-4 h-4 mr-2" />
              Use Claude Code to Resolve
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            onClick={() => navigator.clipboard.writeText(errorDetails.output || '')}
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy Output
          </Button>
          <Button onClick={onClose}>
            Close
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
}; 