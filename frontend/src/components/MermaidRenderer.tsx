import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidRendererProps {
  chart: string;
  id: string;
}

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({ chart, id }) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const renderChart = async () => {
      if (!elementRef.current || !chart) return;

      try {
        // Clear any previous content
        elementRef.current.innerHTML = '';
        setHasError(false);

        // Configure mermaid if needed
        mermaid.initialize({
          startOnLoad: false,
          theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
          securityLevel: 'loose',
          fontFamily: 'monospace',
        });

        // Create a unique ID for this render
        const graphId = `mermaid-${id}-${Date.now()}`;
        
        // Render the chart
        const { svg } = await mermaid.render(graphId, chart);
        
        // Insert the SVG
        if (elementRef.current) {
          elementRef.current.innerHTML = svg;
        }
      } catch (error: any) {
        console.error('Mermaid rendering error:', error);
        setHasError(true);
        setErrorMessage(error?.message || 'Failed to render diagram');
        
        // Try to clean up mermaid's internal state
        try {
          // @ts-expect-error - Mermaid API types don't include reset method
          if (window.mermaid?.mermaidAPI?.reset) {
            // @ts-expect-error - Mermaid API types don't include reset method
            window.mermaid.mermaidAPI.reset();
          }
        } catch (e) {
          // Ignore reset errors
        }
      }
    };

    // Render with a small delay to ensure DOM is ready
    const timer = setTimeout(renderChart, 50);
    return () => clearTimeout(timer);
  }, [chart, id]);

  if (hasError) {
    return (
      <div className="border border-status-error/30 rounded p-4 bg-status-error/10">
        <p className="text-status-error font-semibold">Failed to render diagram</p>
        <pre className="text-xs text-status-error/80 mt-2">{errorMessage}</pre>
      </div>
    );
  }

  return (
    <div 
      ref={elementRef}
      className="mermaid-container my-4 flex justify-center items-center min-h-[100px]"
    />
  );
};