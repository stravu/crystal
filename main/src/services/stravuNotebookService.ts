import { StravuAuthManager } from './stravuAuthManager';
import { Logger } from '../utils/logger';

interface Notebook {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  lastModified: string;
  tags: string[];
  wordCount: number;
  similarity?: number;
}

interface NotebookSearchResult {
  id: string;
  title: string;
  content?: string;
  updated_at: string;
  tags: string[];
  similarity?: number;
}

interface NotebooksApiResponse {
  notebooks: NotebookSearchResult[];
}

interface SearchApiResponse {
  results: NotebookSearchResult[];
}

type CacheValue = Notebook | Notebook[];

export class StravuNotebookService {
  private authManager: StravuAuthManager;
  private cache = new Map<string, CacheValue>();
  private lastFetch: number | null = null;
  private readonly CACHE_TTL = 300000; // 5 minutes
  private logger: Logger;

  constructor(authManager: StravuAuthManager, logger: Logger) {
    this.authManager = authManager;
    this.logger = logger;
  }

  async getNotebooks(forceRefresh = false): Promise<Notebook[]> {
    // Check cache first (5 minute TTL)
    if (!forceRefresh &&
        this.lastFetch &&
        Date.now() - this.lastFetch < this.CACHE_TTL &&
        this.cache.has('notebooks')) {
      return this.cache.get('notebooks') as Notebook[];
    }

    try {
      const response = await this.authManager.makeAuthenticatedRequest('/mcp/v1/notebooks');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: NotebooksApiResponse = await response.json();

      const notebooks: Notebook[] = data.notebooks.map((nb: NotebookSearchResult) => ({
        id: nb.id,
        title: nb.title,
        content: nb.content || '',
        excerpt: this.createExcerpt(nb.content || ''),
        lastModified: nb.updated_at,
        tags: nb.tags || [],
        wordCount: this.countWords(nb.content || '')
      }));

      this.cache.set('notebooks', notebooks);
      this.lastFetch = Date.now();

      this.logger.info(`Fetched ${notebooks.length} notebooks from Stravu`);
      return notebooks;
    } catch (error) {
      this.logger.error('Failed to fetch notebooks:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async getNotebookContent(notebookId: string): Promise<Notebook> {
    const cacheKey = `notebook_${notebookId}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as Notebook;
    }

    try {
      const response = await this.authManager.makeAuthenticatedRequest(
        `/mcp/v1/notebooks/${notebookId}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const notebook: NotebookSearchResult = await response.json();

      const formattedNotebook: Notebook = {
        id: notebook.id,
        title: notebook.title,
        content: notebook.content || '',
        excerpt: this.createExcerpt(notebook.content || ''),
        lastModified: notebook.updated_at,
        tags: notebook.tags || [],
        wordCount: this.countWords(notebook.content || '')
      };

      this.cache.set(cacheKey, formattedNotebook);
      this.logger.info(`Fetched notebook content: ${notebook.title}`);
      return formattedNotebook;
    } catch (error) {
      this.logger.error(`Failed to fetch notebook ${notebookId}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async searchNotebooks(query: string, limit = 20): Promise<Notebook[]> {
    try {
      // Try vector search first for semantic matching
      const response = await this.authManager.makeAuthenticatedRequest('/mcp/v1/notebooks/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit })
      });

      if (response.ok) {
        const data: SearchApiResponse = await response.json();
        const results: Notebook[] = data.results.map((result: NotebookSearchResult) => ({
          id: result.id,
          title: result.title,
          content: result.content || '',
          excerpt: this.createExcerpt(result.content || ''),
          lastModified: result.updated_at,
          tags: result.tags || [],
          wordCount: this.countWords(result.content || ''),
          similarity: result.similarity || 0
        }));

        this.logger.info(`Vector search found ${results.length} results for: ${query}`);
        return results;
      }
    } catch (error) {
      this.logger.warn('Vector search failed, falling back to text search:', error instanceof Error ? error : new Error(String(error)));
    }

    // Fallback to basic text search if vector search fails
    try {
      const notebooks = await this.getNotebooks();
      const lowerQuery = query.toLowerCase();

      const filtered = notebooks.filter(nb =>
        nb.title.toLowerCase().includes(lowerQuery) ||
        nb.excerpt.toLowerCase().includes(lowerQuery) ||
        nb.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      );

      this.logger.info(`Text search found ${filtered.length} results for: ${query}`);
      return filtered;
    } catch (error) {
      this.logger.error('Search failed completely:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private createExcerpt(content: string, maxLength = 150): string {
    if (!content) return '';

    // Remove markdown formatting
    const text = content.replace(/[#*`_\[\]]/g, '').trim();
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  private countWords(content: string): number {
    if (!content) return 0;
    return content.split(/\s+/).filter(word => word.length > 0).length;
  }

  formatNotebookForClaude(notebook: Notebook): string {
    return `# 📓 Stravu Notebook: ${notebook.title}

${notebook.content}

---
*Source: Stravu Notebook "${notebook.title}" (Last updated: ${this.formatDate(notebook.lastModified)})*`;
  }

  private formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString();
  }

  // Clear cache when connection status changes
  clearCache(): void {
    this.cache.clear();
    this.lastFetch = null;
    this.logger.info('Stravu notebook cache cleared');
  }

  // Get cache stats for debugging
  getCacheStats(): { size: number; lastFetch: number | null } {
    return {
      size: this.cache.size,
      lastFetch: this.lastFetch
    };
  }
}
