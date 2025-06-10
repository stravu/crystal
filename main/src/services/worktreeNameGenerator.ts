import Anthropic from '@anthropic-ai/sdk';
import { ConfigManager } from './configManager';
import fs from 'fs/promises';
import path from 'path';

export class WorktreeNameGenerator {
  private anthropic: Anthropic | null = null;
  private configManager: ConfigManager;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
    this.initializeAnthropic();
    
    // Listen for config updates to reinitialize Anthropic client if API key changes
    this.configManager.on('config-updated', () => {
      console.log('[WorktreeNameGenerator] Config updated, reinitializing Anthropic client...');
      this.initializeAnthropic();
    });
  }

  private initializeAnthropic(): void {
    const apiKey = this.configManager.getAnthropicApiKey();
    if (apiKey) {
      console.log('[WorktreeNameGenerator] Initializing Anthropic client with API key');
      this.anthropic = new Anthropic({
        apiKey: apiKey
      });
    } else {
      console.log('[WorktreeNameGenerator] No API key found, AI name generation disabled');
      this.anthropic = null;
    }
  }

  async generateWorktreeName(prompt: string): Promise<string> {
    if (!this.anthropic) {
      console.log('[WorktreeNameGenerator] No Anthropic client available, using fallback name generation');
      // Fallback to basic name generation if no API key
      return this.generateFallbackName(prompt);
    }

    console.log('[WorktreeNameGenerator] Attempting AI-powered name generation for prompt:', prompt.substring(0, 50) + '...');
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307', // Using Haiku for fast, cost-effective naming
        max_tokens: 50,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: `You are a developer assistant that generates concise, descriptive git worktree names. 
            
Rules:
- Generate a short, descriptive name (2-4 words max)
- Use kebab-case (lowercase with hyphens)
- Make it relevant to the coding task described
- Keep it under 30 characters
- Don't include numbers (those will be added for uniqueness)
- Focus on the main feature/task being described

Examples:
- "Fix user authentication bug" → "fix-auth-bug"
- "Add dark mode toggle" → "dark-mode-toggle"
- "Refactor payment system" → "refactor-payments"
- "Update API documentation" → "update-api-docs"

Generate a worktree name for this coding task: "${prompt}"

Respond with ONLY the worktree name, nothing else.`
          }
        ]
      });

      const content = response.content[0];
      if (content.type === 'text' && content.text) {
        const generatedName = content.text.trim();
        if (generatedName) {
          const sanitized = this.sanitizeName(generatedName);
          console.log('[WorktreeNameGenerator] AI generated name:', sanitized);
          return sanitized;
        }
      }
    } catch (error) {
      console.error('Error generating worktree name with Anthropic:', error);
    }

    // Fallback if Anthropic fails
    return this.generateFallbackName(prompt);
  }

  private generateFallbackName(prompt: string): string {
    // Simple fallback: take first few words and convert to kebab-case
    const words = prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .slice(0, 3);
    
    return words.join('-') || 'new-task';
  }

  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30);
  }

  async generateUniqueWorktreeName(prompt: string): Promise<string> {
    const baseName = await this.generateWorktreeName(prompt);
    const gitRepoPath = this.configManager.getGitRepoPath();
    const worktreesPath = path.join(gitRepoPath, 'worktrees');
    
    let uniqueName = baseName;
    let counter = 1;

    try {
      // Check if worktrees directory exists
      await fs.access(worktreesPath);
      
      // Check for existing directories
      while (await this.worktreeExists(worktreesPath, uniqueName)) {
        uniqueName = `${baseName}-${counter}`;
        counter++;
      }
    } catch (error) {
      // worktrees directory doesn't exist yet, so any name is unique
    }

    return uniqueName;
  }

  private async worktreeExists(worktreesPath: string, name: string): Promise<boolean> {
    try {
      const stat = await fs.stat(path.join(worktreesPath, name));
      return stat.isDirectory();
    } catch {
      return false;
    }
  }
}