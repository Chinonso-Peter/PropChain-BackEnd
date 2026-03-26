const fs = require('fs');
const path = require('path');

const BREAKING_CHANGE_MARKER = '-- @allow-breaking-change';
const BLOCKING_INDEX_MARKER = '-- @allow-blocking-index';

const breakingPatterns = [
  {
    regex: /\bDROP\s+TABLE\b/i,
    message: 'DROP TABLE is not backward-compatible. Use expand/contract and a later cleanup migration.',
  },
  {
    regex: /\bDROP\s+COLUMN\b/i,
    message: 'DROP COLUMN is not backward-compatible. Keep the old column until all application versions stop reading it.',
  },
  {
    regex: /\bRENAME\s+COLUMN\b/i,
    message: 'RENAME COLUMN is not backward-compatible. Add the new column, dual-write, backfill, then remove the old column later.',
  },
  {
    regex: /\bALTER\s+COLUMN\b[\s\S]*\bTYPE\b/i,
    message: 'Changing a column type in place can break rolling deployments. Use an additive migration and backfill.',
  },
  {
    regex: /\bALTER\s+COLUMN\b[\s\S]*\bSET\s+NOT\s+NULL\b/i,
    message: 'SET NOT NULL should only happen after a backfill and validation step.',
  },
];

function validateMigrationSql(sql, migrationName) {
  const errors = [];
  const warnings = [];

  for (const pattern of breakingPatterns) {
    if (pattern.regex.test(sql) && !sql.includes(BREAKING_CHANGE_MARKER)) {
      errors.push(`${migrationName}: ${pattern.message}`);
    }
  }

  if (/\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(sql) && !/\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i.test(sql)) {
    if (!sql.includes(BLOCKING_INDEX_MARKER)) {
      warnings.push(
        `${migrationName}: CREATE INDEX without CONCURRENTLY can block writes on large tables. Review zero-downtime impact.`,
      );
    }
  }

  return { errors, warnings };
}

function validateMigrations(repoRoot = process.cwd()) {
  const migrationsDir = path.join(repoRoot, 'prisma', 'migrations');
  const result = {
    checkedMigrations: [],
    errors: [],
    warnings: [],
  };

  if (!fs.existsSync(migrationsDir)) {
    result.errors.push(`Migrations directory not found: ${migrationsDir}`);
    return result;
  }

  const migrationDirs = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  for (const migrationName of migrationDirs) {
    const migrationPath = path.join(migrationsDir, migrationName);
    const migrationSqlPath = path.join(migrationPath, 'migration.sql');
    const rollbackSqlPath = path.join(migrationPath, 'rollback.sql');

    if (!fs.existsSync(migrationSqlPath)) {
      result.errors.push(`${migrationName}: missing migration.sql`);
      continue;
    }

    if (!fs.existsSync(rollbackSqlPath)) {
      result.errors.push(`${migrationName}: missing rollback.sql`);
    }

    const sql = fs.readFileSync(migrationSqlPath, 'utf8');
    const validation = validateMigrationSql(sql, migrationName);

    result.checkedMigrations.push(migrationName);
    result.errors.push(...validation.errors);
    result.warnings.push(...validation.warnings);
  }

  return result;
}

function printResult(result) {
  console.log(`Checked ${result.checkedMigrations.length} migration(s).`);

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (result.errors.length > 0) {
    console.error('\nErrors:');
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
  } else {
    console.log('\nMigration validation passed.');
  }
}

if (require.main === module) {
  const result = validateMigrations(process.cwd());
  printResult(result);
  process.exit(result.errors.length > 0 ? 1 : 0);
}

module.exports = {
  validateMigrations,
};
