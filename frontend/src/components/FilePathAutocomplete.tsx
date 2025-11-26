import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, Folder, Zap } from 'lucide-react';

interface FileItem {
  path: string;
  isDirectory: boolean;
  name: string;
}

interface FilePathAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (path: string) => void;
  sessionId?: string;
  projectId?: string;
  placeholder?: string;
  className?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  isTextarea?: boolean;
  rows?: number;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: React.CSSProperties;
}

const FilePathAutocomplete: React.FC<FilePathAutocompleteProps> = ({
  value,
  onChange,
  onSelect,
  sessionId,
  projectId,
  placeholder,
  className,
  textareaRef,
  isTextarea = false,
  rows = 4,
  disabled = false,
  onKeyDown: externalOnKeyDown,
  onPaste,
  onFocus,
  onBlur,
  style
}) => {
  const [suggestions, setSuggestions] = useState<FileItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [activePattern, setActivePattern] = useState<{ start: number; pattern: string; type: 'file' | 'slash' } | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ 
    left?: number; 
    right?: number; 
    bottom?: number;
    top?: number;
    maxWidth?: number;
  } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get the actual ref to use
  const getInputElement = () => {
    if (isTextarea) {
      return textareaRef?.current || internalTextareaRef.current;
    }
    return inputRef.current;
  };

  // Detect @ pattern (file paths) or / pattern (slash commands) in the text
  const detectPattern = useCallback((text: string, cursorPos: number) => {
    // Find the last @ or / before the cursor
    let lastPatternIndex = -1;
    let patternType: 'file' | 'slash' | null = null;

    for (let i = cursorPos - 1; i >= 0; i--) {
      if (text[i] === '@') {
        lastPatternIndex = i;
        patternType = 'file';
        break;
      } else if (text[i] === '/') {
        lastPatternIndex = i;
        patternType = 'slash';
        break;
      }
      // Stop if we hit whitespace or newline
      if (text[i] === ' ' || text[i] === '\n' || text[i] === '\t') {
        break;
      }
    }

    if (lastPatternIndex !== -1 && patternType) {
      // Extract the pattern from @ or / to cursor
      const pattern = text.substring(lastPatternIndex + 1, cursorPos);
      // Check if there's no whitespace after the trigger
      if (!pattern.includes(' ') && !pattern.includes('\n')) {
        return { start: lastPatternIndex, pattern, type: patternType };
      }
    }
    return null;
  }, []);

  // Calculate dropdown position to ensure it's visible
  const calculateDropdownPosition = useCallback(() => {
    const inputElement = getInputElement();
    if (!inputElement || !dropdownRef.current) return;

    const inputRect = inputElement.getBoundingClientRect();
    const dropdownRect = dropdownRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 20; // Padding from viewport edges
    
    // Calculate available space horizontally
    const spaceOnRight = viewportWidth - inputRect.left - padding;
    const spaceOnLeft = inputRect.right - padding;
    
    // Calculate available space vertically
    const spaceBelow = viewportHeight - inputRect.bottom - padding;
    const spaceAbove = inputRect.top - padding;
    const dropdownHeight = Math.min(dropdownRect.height, 240); // max-h-60 = 240px
    
    // Calculate optimal width
    const desiredWidth = Math.min(dropdownRect.width, 800); // Max 800px as before
    const availableWidth = Math.max(spaceOnRight, spaceOnLeft);
    const actualWidth = Math.min(desiredWidth, availableWidth);
    
    // Decide horizontal positioning
    let horizontalPosition: { left?: number; right?: number; maxWidth?: number } = {};
    if (spaceOnRight >= actualWidth || spaceOnRight >= spaceOnLeft) {
      // Position from left edge
      horizontalPosition = {
        left: 0,
        right: undefined,
        maxWidth: spaceOnRight
      };
    } else {
      // Position from right edge
      horizontalPosition = {
        right: padding,
        left: undefined,
        maxWidth: spaceOnLeft
      };
    }
    
    // Decide vertical positioning
    let verticalPosition: { bottom?: number; top?: number } = {};
    if (spaceBelow >= dropdownHeight) {
      // Position below input (default)
      verticalPosition = {
        top: inputRect.height + 4, // mt-1 = 4px
        bottom: undefined
      };
    } else if (spaceAbove >= dropdownHeight) {
      // Position above input
      verticalPosition = {
        bottom: inputRect.height + 4, // mb-1 = 4px
        top: undefined
      };
    } else {
      // Not enough space, use the side with more space
      if (spaceBelow >= spaceAbove) {
        verticalPosition = {
          top: inputRect.height + 4,
          bottom: undefined
        };
      } else {
        verticalPosition = {
          bottom: inputRect.height + 4,
          top: undefined
        };
      }
    }
    
    setDropdownPosition({
      ...horizontalPosition,
      ...verticalPosition
    });
  }, []);

  // Get available slash commands for the current session
  const getSlashCommands = useCallback((): FileItem[] => {
    if (!sessionId) return [];

    try {
      const slashCommandsKey = `slashCommands_${sessionId}`;
      const stored = localStorage.getItem(slashCommandsKey);
      if (stored) {
        const commands: string[] = JSON.parse(stored);
        console.log('[slash-debug] Retrieved slash commands from localStorage:', commands);
        return commands.map(cmd => ({
          path: cmd,
          isDirectory: false,
          name: cmd
        }));
      }
    } catch (e) {
      console.warn('[slash-debug] Failed to retrieve slash commands:', e);
    }

    return [];
  }, [sessionId]);

  // Search for slash commands
  const searchSlashCommands = useCallback((pattern: string) => {
    const commands = getSlashCommands();
    const filtered = commands.filter(cmd =>
      cmd.path.toLowerCase().includes(pattern.toLowerCase())
    );
    console.log('[slash-debug] Filtered slash commands:', filtered);
    setSuggestions(filtered);
    setSelectedIndex(0);
  }, [getSlashCommands]);

  // Search for files
  const searchFiles = useCallback(async (pattern: string) => {
    if (!sessionId && !projectId) return;

    try {
      const result = await window.electronAPI?.invoke('file:search', {
        sessionId,
        projectId: typeof projectId === 'string' ? parseInt(projectId, 10) : projectId,
        pattern,
        limit: 20
      });

      if (result.success && result.files) {
        setSuggestions(result.files);
        setSelectedIndex(0);
      }
    } catch (error) {
      console.error('Error searching files:', error);
      setSuggestions([]);
    }
  }, [sessionId, projectId]);

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart || 0;

    onChange(newValue);

    // Only check for pattern if value contains "@" or "/" - performance optimization
    if (newValue.includes('@') || newValue.includes('/')) {
      setCursorPosition(cursorPos);

      // Check for @ pattern (file paths) or / pattern (slash commands)
      const pattern = detectPattern(newValue, cursorPos);
      setActivePattern(pattern);

      if (pattern) {
        // Clear existing timeout
        if (searchTimeoutRef.current) {
          clearTimeout(searchTimeoutRef.current);
        }

        // Debounce the search
        searchTimeoutRef.current = setTimeout(() => {
          if (pattern.type === 'slash') {
            console.log('[slash-debug] Searching slash commands with pattern:', pattern.pattern);
            searchSlashCommands(pattern.pattern);
          } else {
            searchFiles(pattern.pattern);
          }
          setShowSuggestions(true);
        }, 200);
      } else {
        setShowSuggestions(false);
        setSuggestions([]);
      }
    } else {
      // No @ or / in text, clear autocomplete state
      if (showSuggestions) {
        setShowSuggestions(false);
        setSuggestions([]);
        setActivePattern(null);
      }
    }
  };

  // Handle selection change (cursor movement)
  const handleSelectionChange = (e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // Only process cursor movement if autocomplete is active - performance optimization
    if (!showSuggestions && !value.includes('@') && !value.includes('/')) {
      return;
    }

    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    const cursorPos = target.selectionStart || 0;
    setCursorPosition(cursorPos);

    // Check if cursor is still within an @ pattern
    const pattern = detectPattern(value, cursorPos);
    setActivePattern(pattern);

    if (!pattern) {
      setShowSuggestions(false);
    }
  };

  // Select a suggestion
  const selectSuggestion = (suggestion: FileItem) => {
    if (!activePattern) return;

    // Replace the pattern with the selected path
    const before = value.substring(0, activePattern.start);
    const after = value.substring(cursorPosition);
    const prefix = activePattern.type === 'slash' ? '/' : '@';
    const newValue = before + prefix + suggestion.path + after;

    onChange(newValue);
    setShowSuggestions(false);
    setSuggestions([]);
    setActivePattern(null);

    // Set cursor position after the inserted path
    const newCursorPos = activePattern.start + suggestion.path.length + 1;
    setTimeout(() => {
      const element = getInputElement();
      if (element) {
        element.focus();
        element.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);

    // Call onSelect callback if provided
    if (onSelect) {
      onSelect(suggestion.path);
    }

    if (activePattern.type === 'slash') {
      console.log('[slash-debug] Selected slash command:', suggestion.path);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    // If we have suggestions and it's a navigation key, handle it
    if (showSuggestions && suggestions.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % suggestions.length);
          return;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
          return;
        case 'Enter':
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            // Allow normal enter behavior with modifiers, pass to external handler
            break;
          }
          e.preventDefault();
          selectSuggestion(suggestions[selectedIndex]);
          return;
        case 'Tab':
          e.preventDefault();
          selectSuggestion(suggestions[selectedIndex]);
          return;
        case 'Escape':
          e.preventDefault();
          setShowSuggestions(false);
          return;
      }
    }

    // Pass through to external handler if provided
    if (externalOnKeyDown) {
      externalOnKeyDown(e);
    }
  };

  // Calculate position when dropdown is shown
  useEffect(() => {
    if (showSuggestions && suggestions.length > 0) {
      // Small delay to ensure dropdown is rendered
      setTimeout(calculateDropdownPosition, 0);
    }
  }, [showSuggestions, suggestions, calculateDropdownPosition]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && event.target && event.target instanceof Node && !dropdownRef.current.contains(event.target)) {
        const element = getInputElement();
        if (element && event.target && event.target instanceof Node && !element.contains(event.target)) {
          setShowSuggestions(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [textareaRef]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const inputProps = {
    value,
    onChange: handleChange,
    onSelect: handleSelectionChange,
    onKeyDown: handleKeyDown,
    onPaste,
    onFocus,
    onBlur,
    placeholder,
    className,
    disabled,
    style
  };

  return (
    <div className="relative h-full w-full">
      {isTextarea ? (
        <textarea
          ref={textareaRef || internalTextareaRef}
          {...inputProps}
          rows={rows}
        />
      ) : (
        <input
          ref={inputRef}
          type="text"
          {...inputProps}
        />
      )}
      
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 max-h-60 overflow-auto rounded-md bg-surface-secondary py-1 shadow-lg ring-1 ring-black ring-opacity-5 border border-border-primary"
          style={{
            minWidth: Math.min(300, dropdownPosition?.maxWidth || 300) + 'px',
            maxWidth: dropdownPosition?.maxWidth || '800px',
            width: 'max-content',
            ...(dropdownPosition && {
              left: dropdownPosition.left !== undefined ? dropdownPosition.left : 'auto',
              right: dropdownPosition.right !== undefined ? dropdownPosition.right : 'auto',
              top: dropdownPosition.top !== undefined ? dropdownPosition.top : 'auto',
              bottom: dropdownPosition.bottom !== undefined ? dropdownPosition.bottom : 'auto'
            })
          }}
        >
          {suggestions.map((suggestion, index) => {
            // Check if this is a slash command (activePattern will be set)
            const isSlashCommand = activePattern?.type === 'slash';

            return (
              <div
                key={suggestion.path}
                className={`flex items-center px-4 py-2.5 cursor-pointer min-w-0 transition-colors ${
                  index === selectedIndex
                    ? 'bg-interactive text-on-interactive'
                    : 'text-text-secondary hover:bg-surface-hover'
                }`}
                onClick={() => selectSuggestion(suggestion)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {isSlashCommand ? (
                  <Zap className="w-4 h-4 mr-3 flex-shrink-0 text-purple-500" />
                ) : suggestion.isDirectory ? (
                  <Folder className="w-4 h-4 mr-3 flex-shrink-0" />
                ) : (
                  <FileText className="w-4 h-4 mr-3 flex-shrink-0" />
                )}
                <span className="text-sm truncate pr-2" title={suggestion.path}>
                  {isSlashCommand ? '/' : ''}{suggestion.path}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FilePathAutocomplete;
