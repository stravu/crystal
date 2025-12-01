import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GripHorizontal } from 'lucide-react';

interface ResizablePanelProps {
  children: React.ReactNode;
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  storageKey: string;
  className?: string;
}

export const ResizablePanel: React.FC<ResizablePanelProps> = ({
  children,
  defaultHeight = 300,
  minHeight = 200,
  maxHeight = 600,
  storageKey,
  className = '',
}) => {
  // Load height from localStorage or use default
  const [height, setHeight] = useState<number>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? parseInt(saved, 10) : defaultHeight;
  });

  const [isResizing, setIsResizing] = useState(false);
  const startYRef = useRef<number>(0);
  const startHeightRef = useRef<number>(0);

  // Save height to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(storageKey, height.toString());
  }, [height, storageKey]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = height;
  }, [height]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    // Calculate the new height based on mouse movement
    // Since we're dragging from the top, moving up should increase height
    const deltaY = startYRef.current - e.clientY;
    const newHeight = startHeightRef.current + deltaY;

    // Clamp height between min and max
    const clampedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
    setHeight(clampedHeight);
  }, [isResizing, minHeight, maxHeight]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Add global mouse event listeners when resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      // Prevent text selection while dragging
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ns-resize';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div
      className={`flex flex-col ${className}`}
      style={{ height: `${height}px` }}
    >
      {/* Resize Handle */}
      <div
        className={`
          flex items-center justify-center
          h-2 cursor-ns-resize
          border-t border-border-primary
          bg-surface-secondary
          hover:bg-surface-hover
          transition-colors
          group
          ${isResizing ? 'bg-interactive/10' : ''}
        `}
        onMouseDown={handleMouseDown}
        title="Drag to resize"
      >
        <GripHorizontal
          className={`
            w-5 h-5 text-text-tertiary
            group-hover:text-text-secondary
            transition-colors
            ${isResizing ? 'text-interactive' : ''}
          `}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-visible">
        {children}
      </div>
    </div>
  );
};
