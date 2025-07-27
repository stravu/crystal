import { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface ErrorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  error: string;
  details?: string;
  command?: string;
}

export function ErrorDialog({ 
  isOpen, 
  onClose, 
  title = "Command Failed", 
  error, 
  details,
  command 
}: ErrorDialogProps) {
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  
  // Check if details are long enough to warrant collapsing
  const shouldCollapse = details && details.length > 500;
  const displayDetails = shouldCollapse && !isDetailsExpanded 
    ? details.substring(0, 400) + '...' 
    : details;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalHeader>
        <div className="flex items-center space-x-3">
          <AlertCircle className="w-6 h-6 text-status-error flex-shrink-0" />
          <span>{title}</span>
        </div>
      </ModalHeader>
      
      <ModalBody>
        <div className="space-y-4">
          <div>
            <p className="text-text-secondary">{error}</p>
          </div>
          
          {command && (
            <div>
              <h4 className="text-sm font-medium text-text-tertiary mb-1">Command:</h4>
              <Card variant="bordered" padding="sm" className="bg-surface-secondary">
                <pre className="text-sm text-text-primary font-mono overflow-x-auto">
                  {command}
                </pre>
              </Card>
            </div>
          )}
          
          {details && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-medium text-text-tertiary">Error Details:</h4>
                {shouldCollapse && (
                  <Button
                    onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                  >
                    {isDetailsExpanded ? (
                      <>
                        <span>Show less</span>
                        <ChevronUp className="w-3 h-3 ml-1" />
                      </>
                    ) : (
                      <>
                        <span>Show more</span>
                        <ChevronDown className="w-3 h-3 ml-1" />
                      </>
                    )}
                  </Button>
                )}
              </div>
              <Card variant="bordered" padding="sm" className="bg-status-error/10 border-status-error/30">
                <pre className="text-sm text-status-error font-mono overflow-x-auto whitespace-pre-wrap">
                  {displayDetails}
                </pre>
              </Card>
            </div>
          )}
        </div>
      </ModalBody>
      
      <ModalFooter>
        <Button onClick={onClose} variant="secondary">
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
}