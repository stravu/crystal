import DOMPurify from 'dompurify';

// Configure DOMPurify for safe HTML output
const config = {
  ALLOWED_TAGS: ['span', 'br', 'p', 'div', 'b', 'i', 'em', 'strong', 'code', 'pre'],
  ALLOWED_ATTR: ['class', 'style'],
  ALLOWED_STYLE_PROPS: ['color', 'background-color', 'font-weight'],
  KEEP_CONTENT: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
};

/**
 * Sanitize HTML content to prevent XSS attacks
 * @param dirty - The potentially unsafe HTML string
 * @returns The sanitized HTML string
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, config);
}

/**
 * Sanitize and format git output for safe display
 * @param output - The raw git output
 * @returns The sanitized and formatted output
 */
export function sanitizeGitOutput(output: string): string {
  // First escape any HTML entities in the raw output
  const escaped = output
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  
  // Then apply any formatting (this is now safe since we've escaped the content)
  return escaped;
}