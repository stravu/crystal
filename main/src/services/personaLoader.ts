import * as fs from 'fs';
import * as path from 'path';

/**
 * Interface representing a persona definition loaded from the agents directory
 */
export interface PersonaDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
}

/**
 * Service for loading persona definitions from the agents directory
 * Personas are agent definitions stored in subdirectories with CLAUDE.md files
 */
export class PersonaLoader {
  private agentsDirectory: string;

  constructor(agentsDirectory: string) {
    this.agentsDirectory = agentsDirectory;
  }

  /**
   * List all available personas by scanning the agents directory
   * @returns Array of PersonaDefinition objects
   */
  listAvailablePersonas(): PersonaDefinition[] {
    try {
      console.log(`[PersonaLoader] Checking agents directory: ${this.agentsDirectory}`);

      // Check if agents directory exists
      if (!fs.existsSync(this.agentsDirectory)) {
        console.warn(`[PersonaLoader] Agents directory not found: ${this.agentsDirectory}`);
        return [];
      }

      console.log('[PersonaLoader] Agents directory exists, reading contents...');

      // Read all subdirectories in the agents folder
      const entries = fs.readdirSync(this.agentsDirectory, { withFileTypes: true });
      const agentDirs = entries.filter(entry => entry.isDirectory());

      console.log(`[PersonaLoader] Found ${agentDirs.length} subdirectories:`, agentDirs.map(d => d.name));

      const personas: PersonaDefinition[] = [];

      for (const dir of agentDirs) {
        const personaId = dir.name;
        const claudeFilePath = path.join(this.agentsDirectory, personaId, 'CLAUDE.md');

        // Check if CLAUDE.md exists in this directory
        if (fs.existsSync(claudeFilePath)) {
          try {
            const systemPrompt = fs.readFileSync(claudeFilePath, 'utf-8');
            const name = this.extractNameFromDirectoryName(personaId);
            const description = this.extractDescriptionFromClaudeFile(systemPrompt);

            personas.push({
              id: personaId,
              name,
              description,
              systemPrompt
            });
          } catch (error) {
            console.error(`[PersonaLoader] Error reading CLAUDE.md for ${personaId}:`, error);
          }
        }
      }

      const sortedPersonas = personas.sort((a, b) => a.name.localeCompare(b.name));
      console.log(`[PersonaLoader] Returning ${sortedPersonas.length} personas:`, sortedPersonas.map(p => p.name));
      return sortedPersonas;
    } catch (error) {
      console.error('[PersonaLoader] Error listing personas:', error);
      return [];
    }
  }

  /**
   * Load a specific persona by ID
   * @param personaId - The ID of the persona (directory name)
   * @returns PersonaDefinition or null if not found
   */
  loadPersonaById(personaId: string): PersonaDefinition | null {
    try {
      const claudeFilePath = path.join(this.agentsDirectory, personaId, 'CLAUDE.md');

      if (!fs.existsSync(claudeFilePath)) {
        console.warn(`[PersonaLoader] CLAUDE.md not found for persona: ${personaId}`);
        return null;
      }

      const systemPrompt = fs.readFileSync(claudeFilePath, 'utf-8');
      const name = this.extractNameFromDirectoryName(personaId);
      const description = this.extractDescriptionFromClaudeFile(systemPrompt);

      return {
        id: personaId,
        name,
        description,
        systemPrompt
      };
    } catch (error) {
      console.error(`[PersonaLoader] Error loading persona ${personaId}:`, error);
      return null;
    }
  }

  /**
   * Get the system prompt content for a specific persona
   * @param personaId - The ID of the persona
   * @returns System prompt string or null if not found
   */
  getSystemPromptForPersona(personaId: string): string | null {
    const persona = this.loadPersonaById(personaId);
    return persona ? persona.systemPrompt : null;
  }

  /**
   * Extract a human-readable name from the directory name
   * Converts kebab-case to Title Case
   * Example: "pm-agent" -> "PM Agent"
   */
  private extractNameFromDirectoryName(dirName: string): string {
    // Special cases for acronyms
    const acronyms: Record<string, string> = {
      'pm': 'PM',
      'qa': 'QA',
      'prd': 'PRD'
    };

    return dirName
      .split('-')
      .map(word => {
        const lowerWord = word.toLowerCase();
        return acronyms[lowerWord] || word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  }

  /**
   * Extract description from the first paragraph of CLAUDE.md
   * Looks for the first non-empty line after the title that isn't a heading
   */
  private extractDescriptionFromClaudeFile(content: string): string {
    const lines = content.split('\n');

    // Skip the first heading and find the first paragraph
    let foundHeading = false;
    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) continue;

      // Mark when we've passed the first heading
      if (trimmed.startsWith('#')) {
        foundHeading = true;
        continue;
      }

      // Return the first non-heading, non-empty line after the heading
      if (foundHeading && !trimmed.startsWith('#')) {
        // Clean up any markdown formatting
        return trimmed
          .replace(/\*\*/g, '') // Remove bold
          .replace(/\*/g, '')   // Remove italics
          .replace(/`/g, '')    // Remove code marks
          .substring(0, 150);   // Limit length
      }
    }

    return 'No description available';
  }
}
