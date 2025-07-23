#!/bin/bash
set -euo pipefail

echo "🔍 Database Migration Safety Checks"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Change to main directory
cd "$(dirname "$0")/../"

# Build the main process
echo -e "\n${YELLOW}Building main process...${NC}"
pnpm run build

# Install and rebuild native modules in main directory
echo -e "\n${YELLOW}Installing and rebuilding native modules...${NC}"
npm rebuild better-sqlite3

# Run migration validation
echo -e "\n${YELLOW}Validating migration files...${NC}"
pnpm run db:validate

# Check migration naming conventions
echo -e "\n${YELLOW}Checking migration naming conventions...${NC}"
cd src/database/migrations
INVALID_NAMES=0
for file in *.ts; do
  if [[ ! "$file" =~ ^[0-9]{3}-[a-z-]+\.ts$ ]] && [[ "$file" != "index.ts" ]] && [[ "$file" != "types.ts" ]]; then
    echo -e "${RED}❌ Invalid migration name: $file${NC}"
    echo "   Migration files must follow pattern: 001-migration-name.ts"
    INVALID_NAMES=$((INVALID_NAMES + 1))
  fi
done

if [ $INVALID_NAMES -eq 0 ]; then
  echo -e "${GREEN}✅ All migration names are valid${NC}"
else
  exit 1
fi

cd ../../../

# Test fresh installation
echo -e "\n${YELLOW}Testing fresh installation...${NC}"
rm -rf ~/.crystal-test-ci
mkdir -p ~/.crystal-test-ci
export CRYSTAL_DIR=~/.crystal-test-ci

# Run the CI startup test
pnpm run db:test:ci

# Test migration idempotency
echo -e "\n${YELLOW}Testing migration idempotency...${NC}"
rm -rf ~/.crystal-test-ci
mkdir -p ~/.crystal-test-ci

# Run migrations multiple times
pnpm run db:migrate
pnpm run db:migrate
pnpm run db:migrate

# Check migration count
MIGRATION_COUNT=$(sqlite3 ~/.crystal-test-ci/crystal.db "SELECT COUNT(*) FROM _migrations;" 2>/dev/null || echo "0")
if [ "$MIGRATION_COUNT" -ne "8" ]; then
  echo -e "${RED}❌ Expected 8 migrations, found $MIGRATION_COUNT${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Idempotency test passed${NC}"

# Test upgrade from legacy
echo -e "\n${YELLOW}Testing upgrade from legacy database...${NC}"
rm -rf ~/.crystal-test-ci
mkdir -p ~/.crystal-test-ci

# Create a minimal legacy database
sqlite3 ~/.crystal-test-ci/crystal.db <<EOF
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  initial_prompt TEXT,
  worktree_name TEXT,
  worktree_path TEXT,
  status TEXT DEFAULT 'pending',
  project_id INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

INSERT INTO projects (name, path) VALUES ('Legacy Project', '/legacy/path');
INSERT INTO sessions (id, name, project_id) VALUES ('legacy-123', 'Legacy Session', 1);
EOF

# Run migrations
pnpm run db:migrate

# Verify data was preserved
PROJECT_COUNT=$(sqlite3 ~/.crystal-test-ci/crystal.db "SELECT COUNT(*) FROM projects;")
SESSION_COUNT=$(sqlite3 ~/.crystal-test-ci/crystal.db "SELECT COUNT(*) FROM sessions;")

if [ "$PROJECT_COUNT" -ne "1" ] || [ "$SESSION_COUNT" -ne "1" ]; then
  echo -e "${RED}❌ Data was not preserved during migration${NC}"
  exit 1
fi

# Check for new columns
if ! sqlite3 ~/.crystal-test-ci/crystal.db "PRAGMA table_info(sessions);" | grep -q "base_commit"; then
  echo -e "${RED}❌ New columns were not added${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Legacy upgrade test passed${NC}"

# Clean up
rm -rf ~/.crystal-test-ci

echo -e "\n${GREEN}✅ All database migration tests passed!${NC}"