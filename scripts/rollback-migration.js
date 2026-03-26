const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function parseArgs(argv) {
  const args = {
    name: undefined,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--name=')) {
      args.name = arg.slice('--name='.length);
    }

    if (arg === '--dry-run') {
      args.dryRun = true;
    }
  }

  return args;
}

function getMigrationName(migrationsDir, requestedName) {
  if (requestedName) {
    return requestedName;
  }

  const migrationDirs = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  return migrationDirs[migrationDirs.length - 1];
}

async function rollbackMigration({ repoRoot = process.cwd(), migrationName, dryRun = false }) {
  const migrationsDir = path.join(repoRoot, 'prisma', 'migrations');
  const resolvedMigrationName = getMigrationName(migrationsDir, migrationName);
  const rollbackPath = path.join(migrationsDir, resolvedMigrationName, 'rollback.sql');

  if (!resolvedMigrationName) {
    throw new Error('No migrations found.');
  }

  if (!fs.existsSync(rollbackPath)) {
    throw new Error(`Rollback script not found for migration ${resolvedMigrationName}`);
  }

  const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');

  if (dryRun) {
    console.log(`Rollback plan for ${resolvedMigrationName}:\n`);
    console.log(rollbackSql);
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set to execute rollback.');
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();
  try {
    await client.query(rollbackSql);
    console.log(`Rollback applied for ${resolvedMigrationName}.`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  rollbackMigration({
    migrationName: args.name,
    dryRun: args.dryRun,
  }).catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  rollbackMigration,
};
