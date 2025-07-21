# Crystal Migration System Transition Checklist

This checklist provides a step-by-step guide for transitioning from the current ad hoc migration system to the new Umzug-based system.

## Pre-Implementation Checklist

- [ ] **Backup Current System**
  - [ ] Create full backup of production database
  - [ ] Document current schema state
  - [ ] Save copy of current `runMigrations()` method
  - [ ] Export all table schemas as SQL

- [ ] **Team Preparation**
  - [ ] Review migration plan with team
  - [ ] Assign implementation responsibilities
  - [ ] Schedule implementation timeline
  - [ ] Plan rollback procedures

## Phase 1: Foundation Setup (Week 1)

### Day 1-2: Infrastructure

- [ ] **Install Dependencies**
  ```bash
  pnpm add umzug
  pnpm add -D @types/umzug
  ```

- [ ] **Create Directory Structure**
  ```
  main/src/database/
  ├── migrator/
  │   ├── index.ts
  │   ├── types.ts
  │   ├── sqlite-adapter.ts
  │   └── __tests__/
  └── migrations/
  ```

- [ ] **Implement Core Types**
  - [ ] Create `types.ts` with all interfaces
  - [ ] Add DataType enum
  - [ ] Define MigrationContext

### Day 3-4: Adapter Implementation

- [ ] **Implement SQLite Adapter**
  - [ ] Basic DDL operations (createTable, dropTable)
  - [ ] Column operations (addColumn, dropColumn)
  - [ ] Index operations
  - [ ] Transaction support
  - [ ] Introspection methods

- [ ] **Write Adapter Tests**
  - [ ] Unit tests for each method
  - [ ] Transaction rollback tests
  - [ ] Foreign key constraint tests
  - [ ] Edge case handling

### Day 5: Migrator Setup

- [ ] **Implement Migrator Class**
  - [ ] Umzug configuration
  - [ ] Migration storage setup
  - [ ] Helper methods (up, down, status)
  - [ ] Migration table initialization

- [ ] **Create CLI Scripts**
  - [ ] `create-migration.ts` script
  - [ ] `run-migrations.ts` script
  - [ ] Update package.json scripts

## Phase 2: Migration Conversion (Week 2)

### Day 1-2: Analysis

- [ ] **Analyze Current Migrations**
  - [ ] List all conditional checks in `runMigrations()`
  - [ ] Group related changes
  - [ ] Identify dependencies
  - [ ] Document complex migrations

- [ ] **Create Migration Plan**
  - [ ] Number migrations in order
  - [ ] Plan table recreation migrations
  - [ ] Identify irreversible migrations
  - [ ] Document data transformations

### Day 3-5: Implementation

- [ ] **Convert Migrations**
  - [ ] 001-initial-schema.ts
  - [ ] 002-add-session-columns.ts
  - [ ] 003-add-projects.ts
  - [ ] 004-add-folders.ts
  - [ ] 005-add-prompt-markers.ts
  - [ ] 006-timestamp-normalization.ts
  - [ ] (Continue for all migrations...)

- [ ] **Test Each Migration**
  - [ ] Test up migration
  - [ ] Test down migration (where possible)
  - [ ] Verify schema matches expected
  - [ ] Check data preservation

## Phase 3: Parallel Testing (Week 3)

### Day 1-2: Integration

- [ ] **Add Feature Flag**
  ```typescript
  const USE_NEW_MIGRATIONS = process.env.USE_NEW_MIGRATIONS === 'true';
  ```

- [ ] **Modify Database Class**
  - [ ] Add conditional migration runner
  - [ ] Add legacy detection logic
  - [ ] Implement conversion method
  - [ ] Add comprehensive logging

### Day 3-4: Testing

- [ ] **Parallel Execution Tests**
  - [ ] Run both systems on test database
  - [ ] Compare resulting schemas
  - [ ] Verify data integrity
  - [ ] Performance benchmarking

- [ ] **Migration Scenarios**
  - [ ] Fresh install
  - [ ] Upgrade from old system
  - [ ] Partial migration state
  - [ ] Error recovery

### Day 5: Documentation

- [ ] **Update Documentation**
  - [ ] Developer guide for migrations
  - [ ] Migration best practices
  - [ ] Troubleshooting guide
  - [ ] API documentation

## Phase 4: Production Rollout (Week 4)

### Day 1: Preparation

- [ ] **Pre-Deployment**
  - [ ] Final code review
  - [ ] Update CI/CD pipelines
  - [ ] Prepare rollback scripts
  - [ ] Schedule maintenance window

### Day 2-3: Deployment

- [ ] **Staged Rollout**
  - [ ] Deploy to development environment
  - [ ] Deploy to staging environment
  - [ ] Monitor for issues
  - [ ] Run integration tests

- [ ] **Production Deployment**
  - [ ] Backup production database
  - [ ] Deploy with feature flag OFF
  - [ ] Enable for subset of users
  - [ ] Monitor error rates

### Day 4: Cutover

- [ ] **Enable New System**
  - [ ] Set feature flag to ON
  - [ ] Run conversion process
  - [ ] Verify migration status
  - [ ] Monitor performance

- [ ] **Validation**
  - [ ] Check all tables exist
  - [ ] Verify column types
  - [ ] Test application functionality
  - [ ] Review error logs

### Day 5: Cleanup

- [ ] **Remove Old Code**
  - [ ] Delete `runMigrations()` method
  - [ ] Remove conditional checks
  - [ ] Clean up unused imports
  - [ ] Update tests

## Post-Implementation Tasks

- [ ] **Monitoring**
  - [ ] Set up alerts for migration failures
  - [ ] Track migration execution times
  - [ ] Monitor database performance
  - [ ] Review error patterns

- [ ] **Documentation**
  - [ ] Update README
  - [ ] Create migration cookbook
  - [ ] Document common patterns
  - [ ] Update onboarding guide

- [ ] **Team Training**
  - [ ] Conduct migration workshop
  - [ ] Review best practices
  - [ ] Practice rollback procedures
  - [ ] Q&A session

## Rollback Plan

If issues arise at any stage:

### Immediate Rollback (< 1 hour)
1. [ ] Disable feature flag
2. [ ] Revert to `runMigrations()`
3. [ ] Investigate issues
4. [ ] Plan fixes

### Short-term Recovery (< 1 day)
1. [ ] Restore database backup
2. [ ] Re-run old migration system
3. [ ] Document failure causes
4. [ ] Update migration code

### Long-term Fix (> 1 day)
1. [ ] Keep old system running
2. [ ] Fix migration issues
3. [ ] Enhanced testing
4. [ ] Re-attempt transition

## Success Criteria

The migration is considered successful when:

- [ ] All existing functionality works correctly
- [ ] No data loss or corruption
- [ ] Performance is equal or better
- [ ] All tests pass
- [ ] No increase in error rates
- [ ] Team is comfortable with new system
- [ ] Documentation is complete
- [ ] Rollback procedures are tested

## Notes

- Keep the old `runMigrations()` code in version control for at least 3 months
- Monitor database performance closely for the first week
- Be prepared to rollback at any sign of issues
- Communicate progress daily during transition
- Celebrate successful completion! 🎉