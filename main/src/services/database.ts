import { DatabaseService } from '../database/database';
import { join } from 'path';
import { getCrystalDirectory } from '../utils/crystalDirectory';

// Create and export a singleton instance
const dbPath = join(getCrystalDirectory(), 'sessions.db');
export const databaseService = new DatabaseService(dbPath);

// Initialize the database schema and run migrations
databaseService.initialize();