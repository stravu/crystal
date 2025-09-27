export interface DebouncedFunction<T extends (...args: never[]) => unknown> {
  (...args: Parameters<T>): void;
  cancel: () => void;
  flush: () => void;
}

export function debounce<T extends (...args: never[]) => unknown>(
  func: T,
  wait: number
): DebouncedFunction<T> {
  let timeout: NodeJS.Timeout | null = null;
  let lastArgs: Parameters<T> | null = null;
  
  const debounced = function(...args: Parameters<T>) {
    lastArgs = args;
    
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(() => {
      func(...args);
      lastArgs = null;
      timeout = null;
    }, wait);
  };
  
  debounced.cancel = function() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    lastArgs = null;
  };
  
  debounced.flush = function() {
    if (timeout && lastArgs) {
      clearTimeout(timeout);
      func(...lastArgs);
      timeout = null;
      lastArgs = null;
    }
  };
  
  return debounced;
}