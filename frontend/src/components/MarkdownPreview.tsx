import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidRenderer } from './MermaidRenderer';

interface CodeComponentProps extends React.HTMLAttributes<HTMLElement> {
  node?: unknown;
  className?: string;
  children?: React.ReactNode;
}

interface MarkdownPreviewProps {
  content: string;
  className?: string;
  id?: string;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content, className = '' }) => {
  const [mermaidKey, setMermaidKey] = useState(0);

  // Force re-render of mermaid diagrams when content changes
  useEffect(() => {
    setMermaidKey(prev => prev + 1);
  }, [content]);

  return (
    <div className={`markdown-preview ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, className, children, ...props }: CodeComponentProps) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const codeString = String(children).replace(/\n$/, '');
            
            // Check if this is an inline code element
            const inline = !className || !className.includes('language-');

            if (!inline && language === 'mermaid') {
              return (
                <MermaidRenderer 
                  key={`mermaid-${mermaidKey}-${codeString.substring(0, 20)}`}
                  chart={codeString} 
                  id={`preview-${Date.now()}`} 
                />
              );
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          // Style other markdown elements
          h1: ({ children }) => <h1 className="text-3xl font-bold mt-6 mb-4 text-text-primary">{children}</h1>,
          h2: ({ children }) => <h2 className="text-2xl font-bold mt-5 mb-3 text-text-primary">{children}</h2>,
          h3: ({ children }) => <h3 className="text-xl font-bold mt-4 mb-2 text-text-primary">{children}</h3>,
          h4: ({ children }) => <h4 className="text-lg font-bold mt-3 mb-2 text-text-primary">{children}</h4>,
          p: ({ children }) => <p className="mb-4 text-text-primary">{children}</p>,
          ul: ({ children }) => <ul className="list-disc mb-4 ml-6 text-text-primary">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal mb-4 ml-6 text-text-primary">{children}</ol>,
          li: ({ children }) => <li className="mb-2 text-text-primary">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-border-secondary pl-4 italic my-4 text-text-tertiary">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto mb-4">
              <table className="min-w-full border-collapse border border-border-primary">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border-primary px-4 py-2 bg-surface-secondary font-semibold text-left text-text-primary">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border-primary px-4 py-2 text-text-primary">
              {children}
            </td>
          ),
          a: ({ href, children }) => (
            <a href={href} className="text-interactive-on-dark" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          hr: () => <hr className="my-6 border-border-primary" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};