import { useState, useRef, useCallback, useEffect, KeyboardEvent } from 'react';
import type { CodexInputOptions } from '../../../shared/types/models';

export interface AttachedImage {
  id: string;
  name: string;
  dataUrl: string;
  size: number;
  type: string;
}

export interface AttachedText {
  id: string;
  name: string;
  content: string;
  size: number;
}

export interface UseAIInputPanelOptions {
  onSendMessage: (message: string, options?: CodexInputOptions | Record<string, unknown>, attachedImages?: AttachedImage[], attachedTexts?: AttachedText[]) => Promise<void>;
  onCancel?: () => void;
  disabled?: boolean;
}

/**
 * Formats attachments into a message string following the Claude panel format
 * @param attachedImages Array of attached images
 * @param attachedTexts Array of attached text blocks
 * @returns Formatted attachment string or empty string if no attachments
 */
export const formatAttachmentsForMessage = (
  attachedImages?: AttachedImage[], 
  attachedTexts?: AttachedText[]
): string => {
  const attachmentPaths: string[] = [];
  
  // Add text attachments
  if (attachedTexts && attachedTexts.length > 0) {
    attachedTexts.forEach(text => {
      // For text attachments, we include the filename with char count
      attachmentPaths.push(`${text.name}`);
    });
  }
  
  // Add image attachments
  if (attachedImages && attachedImages.length > 0) {
    attachedImages.forEach(image => {
      attachmentPaths.push(image.name);
    });
  }
  
  // Format as attachments message if we have any
  if (attachmentPaths.length > 0) {
    return `\n\n<attachments>\nPlease look at these files which may provide additional instructions or context:\n${attachmentPaths.join('\n')}\n</attachments>`;
  }
  
  return '';
};

/**
 * Builds the complete message with inline text content and attachment references
 * @param message The main message text
 * @param attachedImages Array of attached images
 * @param attachedTexts Array of attached text blocks
 * @returns Complete formatted message with attachments
 */
export const buildMessageWithAttachments = (
  message: string,
  attachedImages?: AttachedImage[],
  attachedTexts?: AttachedText[]
): string => {
  let fullMessage = message;
  
  // Add inline text content for text attachments
  if (attachedTexts && attachedTexts.length > 0) {
    let textContent = '\n\n--- Attached Content ---\n';
    attachedTexts.forEach(text => {
      textContent += `\n${text.name}:\n\`\`\`\n${text.content}\n\`\`\`\n`;
    });
    fullMessage += textContent;
  }
  
  // Add attachment references using the same format as Claude panel
  const attachmentMessage = formatAttachmentsForMessage(attachedImages, attachedTexts);
  if (attachmentMessage) {
    fullMessage += attachmentMessage;
  }
  
  return fullMessage;
};

export const useAIInputPanel = (options: UseAIInputPanelOptions) => {
  const { onSendMessage, onCancel, disabled } = options;
  
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [attachedTexts, setAttachedTexts] = useState<AttachedText[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState<number>(52);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateId = useCallback((prefix: string): string => {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  const processImageFile = useCallback(async (file: File): Promise<AttachedImage | null> => {
    if (!file.type.startsWith('image/')) {
      console.warn('File is not an image:', file.name);
      return null;
    }

    // Limit file size to 10MB
    if (file.size > 10 * 1024 * 1024) {
      console.warn('Image file too large (max 10MB):', file.name);
      return null;
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          resolve({
            id: generateId('img'),
            name: file.name,
            dataUrl: e.target.result as string,
            size: file.size,
            type: file.type,
          });
        } else {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }, [generateId]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // Check for text content first
    const textData = e.clipboardData.getData('text/plain');
    const LARGE_TEXT_THRESHOLD = 5000;
    
    if (textData && textData.length > LARGE_TEXT_THRESHOLD) {
      // Large text pasted - convert to attachment
      e.preventDefault();
      
      const textAttachment: AttachedText = {
        id: generateId('txt'),
        name: `Pasted Text (${textData.length.toLocaleString()} chars)`,
        content: textData,
        size: textData.length,
      };
      
      setAttachedTexts(prev => [...prev, textAttachment]);
      console.log(`[Input] Automatically attached ${textData.length} characters from paste`);
      return;
    }

    // Check for images
    const imageItems: DataTransferItem[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        imageItems.push(items[i]);
      }
    }

    if (imageItems.length === 0) return;

    e.preventDefault();

    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) {
        const image = await processImageFile(file);
        if (image) {
          setAttachedImages(prev => [...prev, image]);
        }
      }
    }
  }, [generateId, processImageFile]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const image = await processImageFile(file);
      if (image) {
        setAttachedImages(prev => [...prev, image]);
      }
    }
  }, [processImageFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeImage = useCallback((id: string) => {
    setAttachedImages(prev => prev.filter(img => img.id !== id));
  }, []);

  const removeText = useCallback((id: string) => {
    setAttachedTexts(prev => prev.filter(txt => txt.id !== id));
  }, []);

  const handleSubmit = useCallback(async (additionalOptions?: CodexInputOptions | Record<string, unknown>) => {
    if (!input.trim() || isSubmitting || disabled) return;

    const message = input.trim();
    setInput('');
    setIsSubmitting(true);

    try {
      await onSendMessage(message, additionalOptions, attachedImages, attachedTexts);
      // Clear attachments on successful send
      setAttachedImages([]);
      setAttachedTexts([]);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Restore input on error
      setInput(message);
    } finally {
      setIsSubmitting(false);
      // Refocus textarea
      textareaRef.current?.focus();
    }
  }, [input, isSubmitting, disabled, onSendMessage, attachedImages, attachedTexts]);

  const handleKeyDown = useCallback(async (e: KeyboardEvent<HTMLTextAreaElement>, sessionStatus: string) => {
    // Handle cancel on Escape
    if (e.key === 'Escape' && sessionStatus === 'running' && onCancel) {
      e.preventDefault();
      onCancel();
      return;
    }
    
    // Handle submit on Enter with modifier (Cmd/Ctrl+Enter)
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      await handleSubmit();
    }
  }, [onCancel, handleSubmit]);

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const newHeight = Math.min(Math.max(scrollHeight, 52), 200);
      setTextareaHeight(newHeight);
    }
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const image = await processImageFile(file);
      if (image) {
        setAttachedImages(prev => [...prev, image]);
      }
    }
    e.target.value = ''; // Reset input
  }, [processImageFile]);

  // Auto-resize textarea when input changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  return {
    // State
    input,
    setInput,
    isSubmitting,
    attachedImages,
    attachedTexts,
    isDragging,
    showOptions,
    setShowOptions,
    textareaHeight,
    
    // Refs
    textareaRef,
    fileInputRef,
    
    // Handlers
    handlePaste,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    removeImage,
    removeText,
    handleSubmit,
    handleKeyDown,
    handleFileSelect,
    adjustTextareaHeight,
  };
};