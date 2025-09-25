export interface DebouncedFunction<T extends (...args: never[]) => unknown> {
  (...args: Parameters<T>): void;
  cancel: () => void;
}

export function debounce<T extends (...args: never[]) => unknown>(
  func: T,
  wait: number
): DebouncedFunction<T> {
  let timeout: NodeJS.Timeout | null = null;
  
  const debounced = function(...args: Parameters<T>) {
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
  
  debounced.cancel = function() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };
  
  return debounced;
}