# Zero-Downtime Migrations

This project now treats database migrations as an expand/contract workflow instead of a single-step schema rewrite.

## Rules

1. Additive changes first.
2. Keep old reads and writes working during rolling deploys.
3. Add a `rollback.sql` file to every migration directory.
4. Validate migrations before merge with `npm run migrate:validate`.
5. Test migrations against an empty database with `npm run migrate:test`.

## Expand / Contract Pattern

### Expand

- Add nullable columns, new tables, or additive indexes.
- Backfill data in a separate step.
- Ship application code that can read both old and new shapes.

### Contract

- Remove old columns or constraints only after all running versions no longer depend on them.
- Treat destructive cleanup as a later migration, not part of the initial rollout.

## Rollback Strategy

Every migration directory must contain:

- `migration.sql`
- `rollback.sql`

`rollback.sql` is intended for operational rollback of the database change itself. Prisma migration history is still append-only, so preferred production recovery remains forward-fix plus restore-from-backup when needed.

Dry-run the latest rollback plan with:

```bash
npm run migrate:rollback:dry-run
```

Execute a rollback against the configured database with:

```bash
node scripts/rollback-migration.js --name=<migration_directory>
```

## Validation

`npm run migrate:validate` checks for:

- Missing `rollback.sql`
- Destructive SQL patterns that are not backward-compatible
- Non-concurrent index creation as a zero-downtime warning

Use the explicit marker `-- @allow-breaking-change` only when a destructive migration has been reviewed and coordinated with a maintenance plan.

## Testing

`npm run migrate:test` runs the migration validator and a database integration test that applies Prisma migrations to a clean PostgreSQL test container.
