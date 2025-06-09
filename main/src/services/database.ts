import { DatabaseService } from '../database/database';
import { join } from 'path';
import { homedir } from 'os';

// Create and export a singleton instance
const dbPath = join(homedir(), '.crystal', 'sessions.db');
export const databaseService = new DatabaseService(dbPath);