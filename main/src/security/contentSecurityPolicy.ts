import { session } from 'electron';

/**
 * Configure Content Security Policy for the application
 * This helps prevent XSS attacks by restricting what resources can be loaded
 */
export function setupContentSecurityPolicy(): void {
  // Configure CSP for the default session
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    
    // Define strict CSP policy
    const cspPolicy = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Required for Monaco editor and React
      "style-src 'self' 'unsafe-inline'", // Required for inline styles
      "img-src 'self' data: https:", // Allow images from self, data URIs, and HTTPS
      "font-src 'self' data:", // Allow fonts from self and data URIs
      "connect-src 'self' ws://localhost:* http://localhost:* https://api.github.com https://*.anthropic.com", // API connections
      "media-src 'self'",
      "object-src 'none'", // Disable plugins
      "frame-src 'none'", // Disable iframes
      "base-uri 'self'", // Restrict base tag
      "form-action 'self'", // Restrict form submissions
      "frame-ancestors 'none'", // Prevent clickjacking
      "upgrade-insecure-requests" // Upgrade HTTP to HTTPS
    ].join('; ');
    
    // Set security headers
    responseHeaders['Content-Security-Policy'] = [cspPolicy];
    responseHeaders['X-Content-Type-Options'] = ['nosniff'];
    responseHeaders['X-Frame-Options'] = ['DENY'];
    responseHeaders['X-XSS-Protection'] = ['1; mode=block'];
    responseHeaders['Referrer-Policy'] = ['strict-origin-when-cross-origin'];
    responseHeaders['Permissions-Policy'] = ['camera=(), microphone=(), geolocation=()'];
    
    callback({ responseHeaders });
  });
}

/**
 * Configure additional security measures
 */
export function setupAdditionalSecurity(): void {
  // Prevent navigation to external websites
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    
    // Allow navigation to localhost (development) and file:// protocol
    if (url.protocol === 'file:' || 
        url.hostname === 'localhost' || 
        url.hostname === '127.0.0.1') {
      callback({ cancel: false });
      return;
    }
    
    // Allow specific trusted domains
    const trustedDomains = [
      'api.github.com',
      'github.com',
      'anthropic.com',
      'claude.ai'
    ];
    
    const isTrusted = trustedDomains.some(domain => 
      url.hostname === domain || url.hostname.endsWith(`.${domain}`)
    );
    
    if (!isTrusted) {
      console.warn(`[Security] Blocked navigation to untrusted domain: ${url.hostname}`);
      callback({ cancel: true });
    } else {
      callback({ cancel: false });
    }
  });
  
  // Disable or limit certain web APIs
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    // Deny dangerous permissions
    const deniedPermissions = [
      'media',
      'geolocation',
      'notifications',
      'midi',
      'camera',
      'microphone',
      'usb',
      'serial',
      'bluetooth'
    ];
    
    if (deniedPermissions.includes(permission)) {
      console.warn(`[Security] Denied permission request: ${permission}`);
      callback(false);
    } else {
      callback(true);
    }
  });
}