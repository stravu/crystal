/**
 * Migration registry for embedded migrations in packaged apps
 * This file is automatically updated when migrations are added
 */

import { Migration } from './types';
import coreTables from './001-core-tables';
import conversationSystem from './002-conversation-system';
import executionTracking from './003-execution-tracking';
import projectManagement from './004-project-management';
import uiPersistence from './005-ui-persistence';
import indexesAndConstraints from './006-indexes-and-constraints';
import sessionGitTracking from './007-session-git-tracking';
import legacyColumns from './008-legacy-columns';

// Register all migrations here
export const migrations: Record<string, Migration> = {
  '001-core-tables.ts': coreTables,
  '002-conversation-system.ts': conversationSystem,
  '003-execution-tracking.ts': executionTracking,
  '004-project-management.ts': projectManagement,
  '005-ui-persistence.ts': uiPersistence,
  '006-indexes-and-constraints.ts': indexesAndConstraints,
  '007-session-git-tracking.ts': sessionGitTracking,
  '008-legacy-columns.ts': legacyColumns,
};

// Export migrations as an array sorted by name
export const getMigrations = (): Array<{ name: string; migration: Migration }> => {
  return Object.entries(migrations)
    .map(([name, migration]) => ({ name, migration }))
    .sort((a, b) => a.name.localeCompare(b.name));
};