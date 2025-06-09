import { useEffect } from 'react';

export function MainProcessLogger() {
  useEffect(() => {
    // Forward main process logs to browser console
    const unsubscribe = window.electronAPI?.events?.onMainLog?.((level: string, message: string) => {
      const prefix = '[Main Process]';
      switch (level) {
        case 'error':
          console.error(prefix, message);
          break;
        case 'warn':
          console.warn(prefix, message);
          break;
        case 'info':
          console.info(prefix, message);
          break;
        default:
          console.log(prefix, message);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  return null;
}