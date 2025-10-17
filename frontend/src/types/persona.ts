// Type definitions for Persona system
// Epic 193: Persona Management System

export interface PersonaDefinition {
  id: string;          // 'pm-agent', 'developer-agent', etc.
  name: string;        // 'PM Agent', 'Developer Agent', etc.
  description: string; // First paragraph from CLAUDE.md
  systemPrompt: string; // Full CLAUDE.md content
}
