// Performance utilities for Crystal

/**
 * Checks if the document is visible (not minimized or in background tab)
 */
export const isDocumentVisible = () => {
  return document.visibilityState === 'visible';
};

/**
 * Creates a throttled version of a function that only executes at most once per interval
 */
export const throttle = <T extends (...args: never[]) => unknown>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    
    if (timeSinceLastCall >= delay) {
      lastCall = now;
      func(...args);
    } else {
      // Schedule a call for the remaining time
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        func(...args);
      }, delay - timeSinceLastCall);
    }
  };
};

/**
 * Creates a debounced version of a function
 */
export const debounce = <T extends (...args: never[]) => unknown>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

/**
 * Batches multiple calls into a single execution
 */
export class BatchProcessor<T> {
  private items: T[] = [];
  private timeoutId: NodeJS.Timeout | null = null;
  
  constructor(
    private processor: (items: T[]) => void,
    private delay: number = 16 // ~60fps
  ) {}
  
  add(item: T) {
    this.items.push(item);
    
    if (!this.timeoutId) {
      this.timeoutId = setTimeout(() => {
        const itemsToProcess = [...this.items];
        this.items = [];
        this.timeoutId = null;
        this.processor(itemsToProcess);
      }, this.delay);
    }
  }
  
  flush() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    
    if (this.items.length > 0) {
      const itemsToProcess = [...this.items];
      this.items = [];
      this.processor(itemsToProcess);
    }
  }
}

/**
 * Reduces animation frame rate when document is not visible
 */
export const createVisibilityAwareInterval = (
  callback: () => void,
  activeInterval: number,
  inactiveInterval?: number
): (() => void) => {
  let intervalId: NodeJS.Timeout | null = null;
  
  const updateInterval = () => {
    if (intervalId) {
      clearInterval(intervalId);
    }
    
    const interval = isDocumentVisible() ? activeInterval : (inactiveInterval || activeInterval * 10);
    intervalId = setInterval(callback, interval);
  };
  
  // Initial setup
  updateInterval();
  
  // Listen for visibility changes
  const handleVisibilityChange = () => updateInterval();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  
  // Return cleanup function
  return () => {
    if (intervalId) {
      clearInterval(intervalId);
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
};

/**
 * Intersection Observer for pausing animations when not visible
 */
export const createAnimationObserver = (
  element: HTMLElement,
  onVisible: () => void,
  onHidden: () => void
): (() => void) => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          onVisible();
        } else {
          onHidden();
        }
      });
    },
    { threshold: 0.1 }
  );
  
  observer.observe(element);
  
  return () => observer.disconnect();
};