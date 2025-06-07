// Utility for making API calls that work in both dev and production modes

const getApiBaseUrl = () => {
  // In production (Electron), we need to use absolute URLs
  if (window.location.protocol === 'file:') {
    return 'http://localhost:3001';
  }
  // In development, we can use relative URLs (proxied by Vite)
  return '';
};

export const apiUrl = (path: string) => {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}${path}`;
};

export const apiFetch = async (path: string, options?: RequestInit) => {
  return fetch(apiUrl(path), options);
};