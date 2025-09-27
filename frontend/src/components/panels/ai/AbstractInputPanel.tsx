import React, { KeyboardEvent } from 'react';
import { Send, Settings2, X, Paperclip, FileText, Square } from 'lucide-react';
import type { Session } from '../../../types/session';

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

export interface InputOptions {
  model?: string;
  modelProvider?: string;
  approvalPolicy?: 'manual' | 'auto';
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
  webSearch?: boolean;
  ultrathink?: boolean;
  [key: string]: unknown;
}

export interface AbstractInputPanelProps {
  session: Session;
  panelId: string;
  onSendMessage: (message: string, options?: InputOptions, attachedImages?: AttachedImage[], attachedTexts?: AttachedText[]) => Promise<void>;
  disabled?: boolean;
  initialModel?: string;
  placeholder?: string;
  statusIndicator?: React.ReactNode;
  contextBar?: React.ReactNode;
  optionsPanel?: React.ReactNode;
  actionButtons?: React.ReactNode;
  onCancel?: () => void;
}

export interface AbstractInputPanelState {
  input: string;
  isSubmitting: boolean;
  attachedImages: AttachedImage[];
  attachedTexts: AttachedText[];
  isDragging: boolean;
  showOptions: boolean;
  textareaHeight: number;
}

export abstract class AbstractInputPanel<
  P extends AbstractInputPanelProps = AbstractInputPanelProps,
  S extends AbstractInputPanelState = AbstractInputPanelState
> extends React.Component<P, S> {
  protected inputRef = React.createRef<HTMLTextAreaElement>();
  protected fileInputRef = React.createRef<HTMLInputElement>();
  
  constructor(props: P) {
    super(props);
    this.state = {
      input: '',
      isSubmitting: false,
      attachedImages: [],
      attachedTexts: [],
      isDragging: false,
      showOptions: false,
      textareaHeight: 52,
      ...this.getInitialState?.(),
    } as S;
  }

  // Optional method for subclasses to add their own initial state
  protected getInitialState?(): Partial<S>;

  // Abstract methods that subclasses must implement
  abstract getDefaultOptions(): InputOptions;
  abstract renderOptionsPanel(): React.ReactNode;
  abstract renderActionButtons(): React.ReactNode;
  abstract getPlaceholder(): string;
  
  // Optional methods that subclasses can override
  protected renderContextBar(): React.ReactNode {
    return null;
  }

  protected renderStatusIndicator(): React.ReactNode {
    const { session } = this.props;
    
    if (session.status === 'running') {
      return (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>Processing...</span>
          </div>
        </div>
      );
    }
    return null;
  }

  protected generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  protected async processImageFile(file: File): Promise<AttachedImage | null> {
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
            id: this.generateId('img'),
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
  }

  protected handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // Check for text content first
    const textData = e.clipboardData.getData('text/plain');
    const LARGE_TEXT_THRESHOLD = 5000;
    
    if (textData && textData.length > LARGE_TEXT_THRESHOLD) {
      // Large text pasted - convert to attachment
      e.preventDefault();
      
      const textAttachment: AttachedText = {
        id: this.generateId('txt'),
        name: `Pasted Text (${textData.length.toLocaleString()} chars)`,
        content: textData,
        size: textData.length,
      };
      
      this.setState(prevState => ({
        attachedTexts: [...prevState.attachedTexts, textAttachment]
      }));
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
        const image = await this.processImageFile(file);
        if (image) {
          this.setState(prevState => ({
            attachedImages: [...prevState.attachedImages, image]
          }));
        }
      }
    }
  };

  protected handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    this.setState({ isDragging: false });

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const image = await this.processImageFile(file);
      if (image) {
        this.setState(prevState => ({
          attachedImages: [...prevState.attachedImages, image]
        }));
      }
    }
  };

  protected handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    this.setState({ isDragging: true });
  };

  protected handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    this.setState({ isDragging: false });
  };

  protected removeImage = (id: string) => {
    this.setState(prevState => ({
      attachedImages: prevState.attachedImages.filter(img => img.id !== id)
    }));
  };

  protected removeText = (id: string) => {
    this.setState(prevState => ({
      attachedTexts: prevState.attachedTexts.filter(txt => txt.id !== id)
    }));
  };

  protected handleKeyDown = async (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const { session, onCancel } = this.props;
    
    // Handle cancel on Escape
    if (e.key === 'Escape' && session.status === 'running' && onCancel) {
      e.preventDefault();
      onCancel();
      return;
    }
    
    // Handle submit on Enter with modifier
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await this.handleSubmit();
    }
  };

  protected handleSubmit = async () => {
    const { onSendMessage, disabled } = this.props;
    const { input, isSubmitting, attachedImages, attachedTexts } = this.state;
    
    if (!input.trim() || isSubmitting || disabled) return;

    const message = input.trim();
    this.setState({ input: '', isSubmitting: true });

    try {
      const options = this.getDefaultOptions();
      await onSendMessage(message, options, attachedImages, attachedTexts);
      // Clear attachments on successful send
      this.setState({ attachedImages: [], attachedTexts: [] });
    } catch (error) {
      console.error('Failed to send message:', error);
      // Restore input on error
      this.setState({ input: message });
    } finally {
      this.setState({ isSubmitting: false });
      // Refocus textarea
      this.inputRef.current?.focus();
    }
  };

  protected adjustTextareaHeight = () => {
    const textarea = this.inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 200);
      this.setState({ textareaHeight: newHeight });
    }
  };

  protected handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const image = await this.processImageFile(file);
      if (image) {
        this.setState(prevState => ({
          attachedImages: [...prevState.attachedImages, image]
        }));
      }
    }
    e.target.value = ''; // Reset input
  };

  componentDidUpdate(_prevProps: P, prevState: S) {
    // Auto-resize textarea when input changes
    if (prevState.input !== this.state.input) {
      this.adjustTextareaHeight();
    }
  }

  render() {
    const { session, onCancel } = this.props;
    const { 
      input, 
      isSubmitting, 
      attachedImages, 
      attachedTexts, 
      isDragging, 
      showOptions,
      textareaHeight 
    } = this.state;

    return (
      <div className="border-t border-border-primary bg-surface-primary">
        {/* Context Bar */}
        {this.renderContextBar()}
        
        {/* Options Panel */}
        {showOptions && (
          <div className="px-4 py-3 border-b border-border-primary bg-surface-secondary">
            {this.renderOptionsPanel()}
          </div>
        )}

        {/* Input Area */}
        <div 
          className="flex flex-col gap-2 p-3"
          onDrop={this.handleDrop}
          onDragOver={this.handleDragOver}
          onDragLeave={this.handleDragLeave}
        >
          {/* Attached items */}
          {(attachedImages.length > 0 || attachedTexts.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {/* Attached text files */}
              {attachedTexts.map((text: AttachedText) => (
                <div key={text.id} className="relative group">
                  <div className="h-12 px-3 flex items-center gap-2 bg-surface-secondary rounded border border-border-primary">
                    <FileText className="w-4 h-4 text-text-secondary" />
                    <span className="text-xs text-text-secondary max-w-[150px] truncate">
                      {text.name}
                    </span>
                  </div>
                  <button
                    onClick={() => this.removeText(text.id)}
                    className="absolute -top-1 -right-1 bg-surface-primary border border-border-primary rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  >
                    <X className="w-2.5 h-2.5 text-text-secondary" />
                  </button>
                </div>
              ))}
              
              {/* Attached images */}
              {attachedImages.map((image: AttachedImage) => (
                <div key={image.id} className="relative group">
                  <img
                    src={image.dataUrl}
                    alt={image.name}
                    className="h-12 w-12 object-cover rounded border border-border-primary"
                  />
                  <button
                    onClick={() => this.removeImage(image.id)}
                    className="absolute -top-1 -right-1 bg-surface-primary border border-border-primary rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  >
                    <X className="w-2.5 h-2.5 text-text-secondary" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Main input row */}
          <div className="flex items-end gap-2">
            {/* Options button */}
            <button
              onClick={() => this.setState({ showOptions: !showOptions })}
              className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-md transition-colors"
              title="Options"
            >
              <Settings2 className="w-4 h-4" />
            </button>

            {/* Attach button */}
            <button
              onClick={() => this.fileInputRef.current?.click()}
              className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-md transition-colors"
              title="Attach images"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Textarea */}
            <div className="flex-1 relative">
              <textarea
                ref={this.inputRef}
                value={input}
                onChange={(e) => {
                  this.setState({ input: e.target.value });
                }}
                onKeyDown={this.handleKeyDown}
                onPaste={this.handlePaste}
                placeholder={isDragging ? "Drop images here..." : this.getPlaceholder()}
                disabled={isSubmitting || this.props.disabled}
                className="w-full px-3 py-2 bg-bg-primary border border-border-primary rounded-lg 
                         text-text-primary placeholder-text-tertiary resize-none
                         focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary
                         disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  minHeight: '40px', 
                  maxHeight: '200px',
                  height: `${textareaHeight}px` 
                }}
                rows={1}
              />
            </div>

            {/* Action buttons - Cancel or Send */}
            {session.status === 'running' && onCancel ? (
              <button
                onClick={onCancel}
                className="p-2 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                title="Cancel (Esc)"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={this.handleSubmit}
                disabled={!input.trim() || isSubmitting || this.props.disabled}
                className="p-2 text-accent-primary hover:text-accent-hover hover:bg-accent-primary/10 
                         rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Send message (Enter)"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Additional action buttons */}
          {this.renderActionButtons()}

          {/* Hidden file input */}
          <input
            ref={this.fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={this.handleFileSelect}
          />
        </div>

        {/* Status Indicator */}
        {this.renderStatusIndicator()}
      </div>
    );
  }
}