import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { formatDistanceToNow } from '../utils/formatters';
import { formatDuration, getTimeDifference, isValidTimestamp, parseTimestamp } from '../utils/timestampUtils';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/Modal';
import { IconButton } from './ui/IconButton';

interface PromptMarker {
  id: number;
  session_id?: string;
  panel_id?: string;
  prompt_text: string;
  output_index: number;
  output_line?: number;
  timestamp: string;
  completion_timestamp?: string;
}

interface PromptDetailModalProps {
  prompt: PromptMarker;
  promptIndex: number;
  onClose: () => void;
}

export function PromptDetailModal({ prompt, promptIndex, onClose }: PromptDetailModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt.prompt_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const calculateDuration = (): string => {
    try {
      if (!isValidTimestamp(prompt.timestamp)) {
        return 'Unknown duration';
      }
      
      if (prompt.completion_timestamp && isValidTimestamp(prompt.completion_timestamp)) {
        const durationMs = getTimeDifference(prompt.timestamp, prompt.completion_timestamp);
        if (durationMs < 0) {
          return 'Invalid duration';
        }
        return formatDuration(durationMs);
      }
      
      return 'Duration unavailable';
    } catch (error) {
      console.error('Error calculating duration:', error);
      return 'Unknown duration';
    }
  };

  // No need for manual escape handling - Modal component handles it

  return (
    <Modal isOpen={true} onClose={onClose} size="lg" showCloseButton={false}>
      <ModalHeader onClose={onClose}>
        <div className="flex items-center justify-between flex-1 pr-2">
          <div className="flex items-center space-x-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Prompt #{promptIndex + 1}
            </h2>
            <div className="flex items-center space-x-2 text-sm text-text-tertiary">
              <span>{formatDistanceToNow(parseTimestamp(prompt.timestamp))} ago</span>
              <span className="text-text-tertiary">•</span>
              <span className="font-medium">{calculateDuration()}</span>
            </div>
          </div>
          <IconButton
            onClick={handleCopy}
            variant="ghost"
            size="sm"
            aria-label="Copy prompt"
            icon={copied ? <Check className="h-4 w-4 text-status-success" /> : <Copy className="h-4 w-4" />}
          />
        </div>
      </ModalHeader>

      <ModalBody>
        <pre className="whitespace-pre-wrap font-mono text-sm text-text-primary bg-surface-primary p-4 rounded-md border border-border-secondary">
          {prompt.prompt_text}
        </pre>
      </ModalBody>

      <ModalFooter>
        <div className="flex items-center justify-between w-full text-sm text-text-tertiary">
          <span>Press ESC to close</span>
          <span>Double-click any prompt to view details</span>
        </div>
      </ModalFooter>
    </Modal>
  );
}