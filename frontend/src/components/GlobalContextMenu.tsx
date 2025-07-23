import { useEffect, useRef } from 'react';
import { useContextMenuStore } from '../stores/contextMenuStore';

export function GlobalContextMenu() {
  const { isOpen, position, menuItems, closeContextMenu } = useContextMenuStore();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeContextMenu();
      }
    };

    // Small delay to prevent immediate closing when opening
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, closeContextMenu]);

  // Close menu when pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeContextMenu]);

  // Adjust position if menu would go off-screen
  const getAdjustedPosition = () => {
    if (!menuRef.current) return position;

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let { x, y } = position;

    // Adjust horizontal position
    if (x + rect.width > viewportWidth) {
      x = viewportWidth - rect.width - 10; // 10px margin
    }
    if (x < 10) {
      x = 10; // 10px minimum margin
    }

    // Adjust vertical position
    if (y + rect.height > viewportHeight) {
      y = viewportHeight - rect.height - 10; // 10px margin
    }
    if (y < 10) {
      y = 10; // 10px minimum margin
    }

    return { x, y };
  };

  const handleMenuItemClick = (onClick: () => void) => {
    onClick();
    closeContextMenu();
  };

  if (!isOpen || menuItems.length === 0) {
    return null;
  }

  const adjustedPosition = getAdjustedPosition();

  return (
    <div
      ref={menuRef}
      className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 z-50 min-w-[150px] animate-in fade-in-0 duration-100"
      style={{ 
        top: adjustedPosition.y, 
        left: adjustedPosition.x 
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((item, index) => {
        if (item.isDivider) {
          return (
            <div 
              key={`${item.id}-${index}`}
              className="border-t border-gray-200 dark:border-gray-700 my-1" 
            />
          );
        }

        return (
          <button
            key={`${item.id}-${index}`}
            onClick={() => handleMenuItemClick(item.onClick)}
            disabled={item.disabled}
            className={
              item.className || 
              `w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed`
            }
          >
            <div className="flex items-center gap-2">
              {item.icon && (
                <span className="flex-shrink-0">
                  {item.icon}
                </span>
              )}
              <span>{item.label}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}