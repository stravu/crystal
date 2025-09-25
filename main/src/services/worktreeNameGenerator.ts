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
      this.initializeAnthropic();
    });
  }

  private initializeAnthropic(): void {
    const apiKey = this.configManager.getAnthropicApiKey();
    if (apiKey) {
      this.anthropic = new Anthropic({
        apiKey: apiKey
      });
    } else {
      this.anthropic = null;
    }
  }

  async generateSessionName(prompt: string): Promise<string> {
    if (!this.anthropic) {
      // Fallback to basic name generation if no API key
      return this.generateFallbackSessionName(prompt);
    }

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307', // Using Haiku for fast, cost-effective naming
        max_tokens: 50,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: `You are a developer assistant that generates concise, descriptive session names. 
            
Rules:
- Generate a short, descriptive name (2-4 words max)
- Use normal spacing between words
- Make it relevant to the coding task described
- Keep it under 30 characters
- Don't include numbers (those will be added for uniqueness)
- Focus on the main feature/task being described

Examples:
- "Fix user authentication bug" → "Fix Auth Bug"
- "Add dark mode toggle" → "Dark Mode Toggle"
- "Refactor payment system" → "Refactor Payments"
- "Update API documentation" → "Update API Docs"

Generate a session name for this coding task: "${prompt}"

Respond with ONLY the session name, nothing else.`
          }
        ]
      });

      const content = response.content[0];
      if (content.type === 'text' && content.text) {
        const generatedName = content.text.trim();
        if (generatedName) {
          const sanitized = this.sanitizeSessionName(generatedName);
          return sanitized;
        }
      }
    } catch (error) {
      console.error('Error generating session name with Anthropic:', error);
    }

    // Fallback if Anthropic fails
    return this.generateFallbackSessionName(prompt);
  }

  async generateWorktreeName(prompt: string): Promise<string> {
    // Generate a session name first, then convert to worktree name
    const sessionName = await this.generateSessionName(prompt);
    return this.convertSessionNameToWorktreeName(sessionName);
  }

  private generateFallbackSessionName(prompt: string): string {
    // Simple fallback: take first few words and capitalize properly
    const words = prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .slice(0, 3)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1));
    
    return words.join(' ') || 'New Task';
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

  private sanitizeSessionName(name: string): string {
    // Allow spaces in session names but remove other special characters
    return name
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, ' ')  // Normalize multiple spaces to single space
      .trim()
      .substring(0, 30);
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

  private convertSessionNameToWorktreeName(sessionName: string): string {
    // Convert session name (with spaces) to worktree name (with hyphens)
    return sessionName
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