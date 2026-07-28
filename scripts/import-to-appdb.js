/**
 * Import MongoDB 3.6.23 Backup into local app_db and Inject tenantId
 *
 * 将远程 MongoDB 3.6.23 导出的备份数据导入到本地 app_db 数据库，
 * 并自动在所有集合中注入 tenantId（绑定到 DEFAULT 租户）。
 *
 * Usage:
 *   node scripts/import-to-appdb.js <backup_dir>
 *
 * Examples:
 *   node scripts/import-to-appdb.js /tmp/mongo_backup/nldb
 *   node scripts/import-to-appdb.js /tmp/mongo_backup/nldb --dry-run
 *   node scripts/import-to-appdb.js /tmp/mongo_backup/nldb --drop
 *
 * Options:
 *   --dry-run      Preview changes without actually importing data
 *   --drop         DROP existing collection before import (DELETES ALL DATA in app_db!)
 *
 * Prerequisites:
 *   - Backup directory contains .bson files (mongodump output)
 *   - mongorestore is in PATH
 *   - Local MongoDB is running on configured port
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ─── Configuration ──────────────────────────────────────────────────────────

const TARGET_DB = 'app_db';

const MONGO_HOST = process.env.MONGO_HOST || 'localhost';
const MONGO_PORT = process.env.MONGO_PORT || '27027';
const MONGO_USER = process.env.MONGO_USER;
const MONGO_PASSWORD = process.env.MONGO_PASSWORD;
const MONGO_AUTH_SOURCE = process.env.MONGO_AUTH_SOURCE || 'admin';

const SEPARATOR_WIDTH = 60;

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildMongoUri(dbName) {
  const db = dbName || TARGET_DB;
  if (process.env.MONGODB) {
    const url = new URL(process.env.MONGODB);
    url.pathname = `/${db}`;
    return url.toString();
  }

  if (MONGO_USER && MONGO_PASSWORD) {
    return `mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/${db}?authSource=${MONGO_AUTH_SOURCE}`;
  }
  return `mongodb://${MONGO_HOST}:${MONGO_PORT}/${db}`;
}

function redactSensitive(text) {
  let result = text;
  if (MONGO_PASSWORD) {
    result = result.replace(new RegExp(MONGO_PASSWORD, 'g'), '***');
  }
  return result;
}

function log(msg) {
  console.log(msg);
}

function error(msg) {
  console.error(`✗ ${msg}`);
}

function checkMongoRestore() {
  try {
    execSync('mongorestore --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Find .bson files in a directory. Handles both:
 *   flat:   dir/collection.bson
 *   nested: dir/dbname/collection.bson  (mongodump --out format)
 * @param {string} dir
 * @returns {{bsonDir: string, collections: string[]}}
 */
function findBsonFiles(dir) {
  // First check flat structure
  const flatFiles = fs.readdirSync(dir).filter(f => f.endsWith('.bson'));
  if (flatFiles.length > 0) {
    return {
      bsonDir: dir,
      collections: flatFiles.map(f => f.replace('.bson', '')),
    };
  }

  // Check nested structure (mongodump --out creates dbname/ subdirectory)
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(dir, entry.name);
      const files = fs.readdirSync(subDir).filter(f => f.endsWith('.bson'));
      if (files.length > 0) {
        return {
          bsonDir: subDir,
          collections: files.map(f => f.replace('.bson', '')),
        };
      }
    }
  }

  return { bsonDir: null, collections: [] };
}

/**
 * Import a single collection using mongorestore
 */
function importCollection(collectionName, bsonFile, dryRun, useDrop) {
  if (dryRun) {
    const mode = useDrop ? '[DROP+IMPORT]' : '[MERGE]';
    log(`  [DRY-RUN] Would import ${collectionName} ${mode} from ${path.basename(bsonFile)}`);
    return Promise.resolve({ success: true, count: 'unknown' });
  }

  const mode = useDrop ? 'DROP+IMPORT' : 'MERGE';
  log(`  Importing ${collectionName} (${mode} mode)...`);

  const args = [
    '--host', MONGO_HOST,
    '--port', MONGO_PORT,
  ];

  if (MONGO_USER && MONGO_PASSWORD) {
    args.push('--username', MONGO_USER);
    args.push('--password', MONGO_PASSWORD);
    args.push('--authenticationDatabase', MONGO_AUTH_SOURCE);
  }

  args.push('--db', TARGET_DB);
  args.push('--collection', collectionName);
  args.push(bsonFile);

  if (useDrop) {
    args.push('--drop');
  }

  return new Promise((resolve) => {
    const proc = spawn('mongorestore', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const match = output.match(/(\d+) document\(s\)/);
        const count = match ? parseInt(match[1]) : 'unknown';
        log(`  ✓ Imported ${count} document(s)`);
        resolve({ success: true, count });
      } else {
        const safeError = redactSensitive(errorOutput || output);
        error(`Failed to import ${collectionName}: exit code ${code}`);
        if (safeError) {
          error(safeError.trim());
        }
        resolve({ success: false, error: `mongorestore exited with code ${code}` });
      }
    });

    proc.on('error', (err) => {
      error(`Failed to spawn mongorestore: ${err.message}`);
      resolve({ success: false, error: err.message });
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  const dryRun = args.includes('--dry-run');
  const useDrop = args.includes('--drop');

  // Backup directory is the first non-flag argument
  const backupDir = args.find(arg => !arg.startsWith('--'));

  if (!backupDir) {
    console.log(`
Usage: node scripts/import-to-appdb.js <backup_dir> [options]

Examples:
  node scripts/import-to-appdb.js /tmp/mongo_backup/nldb
  node scripts/import-to-appdb.js /tmp/mongo_backup/nldb --dry-run
  node scripts/import-to-appdb.js /tmp/mongo_backup/nldb --drop

Options:
  --dry-run      Preview changes without actually importing data
  --drop         DROP existing collection before import (DELETES ALL DATA!)

This script will:
  1. Restore all collections from backup into app_db database
  2. Create a DEFAULT tenant in app_db.tenants (if not exists)
  3. Inject tenantId into all imported documents
`);
    process.exit(1);
  }

  // Resolve backup directory
  const resolvedBackupDir = path.resolve(backupDir);

  // Check prerequisites
  if (!dryRun && !checkMongoRestore()) {
    error('mongorestore not found in PATH.');
    error('Install MongoDB Database Tools: https://www.mongodb.com/try/download/database-tools');
    process.exit(1);
  }

  if (!fs.existsSync(resolvedBackupDir)) {
    error(`Backup directory not found: ${resolvedBackupDir}`);
    process.exit(1);
  }

  // Find .bson files
  const { bsonDir, collections } = findBsonFiles(resolvedBackupDir);
  if (collections.length === 0) {
    error(`No .bson files found in: ${resolvedBackupDir}`);
    process.exit(1);
  }

  // Skip system collections
  const systemCollections = ['system.users', 'system.version', 'system.indexes'];
  const importCollections = collections.filter(c => !c.startsWith('system.'));

  log('='.repeat(SEPARATOR_WIDTH));
  log('Import 3.6.23 Backup → app_db + Inject tenantId');
  log('='.repeat(SEPARATOR_WIDTH));
  if (dryRun) {
    log('*** DRY RUN - No data will be modified ***');
  }
  log(`Backup dir:      ${resolvedBackupDir}`);
  log(`BSON source:     ${bsonDir}`);
  log(`Target DB:       ${TARGET_DB}`);
  log(`Mode:            ${useDrop ? '⚠️  DROP (deletes existing data)' : '✓ MERGE (preserves existing data)'}`);
  log(`System skipped:  ${systemCollections.filter(c => collections.includes(c)).join(', ') || 'none'}`);
  log(`Will import:     ${importCollections.join(', ')}`);
  log('');

  // Warnings
  if (useDrop && !dryRun) {
    log('⚠️  ⚠️  ⚠️  DANGER: --drop MODE ENABLED ⚠️  ⚠️  ⚠️');
    log(`   ALL EXISTING DATA in app_db.${importCollections.join(', app_db.')} will be DELETED!`);
    log('');
    log('   Press Ctrl+C within 10 seconds to cancel...');
    log('');
    await sleep(10000);
  } else if (!dryRun) {
    log('✓ Using MERGE mode - existing data will be preserved');
    log('  Starting in 3 seconds... (Ctrl+C to cancel)');
    await sleep(3000);
  }

  // Connect to MongoDB - auth against the existing auth source, operate on app_db
  const uri = buildMongoUri(MONGO_AUTH_SOURCE);
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  });

  try {
    await client.connect();
    log('✓ Connected to MongoDB\n');

    // ── Check if app_db exists, create if not ──
    const adminDb = client.db().admin();
    const dbList = await adminDb.listDatabases();
    const dbExists = dbList.databases.some(d => d.name === TARGET_DB);

    if (!dbExists) {
      log(`── Creating database: ${TARGET_DB} ──`);
      // MongoDB creates databases lazily - force creation by writing a document
      const initDb = client.db(TARGET_DB);
      const initCol = initDb.collection('_init');
      await initCol.insertOne({ created: new Date(), note: 'auto-created by import-to-appdb.js' });
      log(`  ✓ Database ${TARGET_DB} created\n`);
    } else {
      log(`✓ Database ${TARGET_DB} already exists\n`);
    }

    const db = client.db(TARGET_DB);

    // ── Step 1: Ensure DEFAULT tenant exists in app_db ──
    log('── Setting up DEFAULT tenant in app_db ──');
    const tenantsCol = db.collection('tenants');

    let targetTenant = await tenantsCol.findOne({ code: 'DEFAULT' });

    if (!targetTenant) {
      log('  DEFAULT tenant not found in app_db, creating...');
      const insertResult = await tenantsCol.insertOne({
        code: 'DEFAULT',
        name: '默认租户',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      targetTenant = { _id: insertResult.insertedId };
      log(`  ✓ Created DEFAULT tenant: ${targetTenant._id}`);
    } else {
      log(`  ✓ DEFAULT tenant already exists: ${targetTenant._id}`);
    }

    const tenantId = targetTenant._id;
    log('');

    // ── Step 2: Import collections from backup ──
    const results = [];

    for (const collectionName of importCollections) {
      log('─'.repeat(SEPARATOR_WIDTH));
      log(`Processing: ${collectionName}`);
      log('─'.repeat(SEPARATOR_WIDTH));

      const col = db.collection(collectionName);
      const bsonFile = path.join(bsonDir, `${collectionName}.bson`);

      // Count before
      const countBefore = await col.countDocuments();
      log(`  Before import: ${countBefore} document(s)`);

      // Import
      const importResult = await importCollection(collectionName, bsonFile, dryRun, useDrop);

      if (!importResult.success) {
        results.push({
          collection: collectionName,
          success: false,
          error: importResult.error,
        });
        log('');
        continue;
      }

      if (dryRun) {
        log(`  [DRY-RUN] Would inject tenantId into imported documents`);
        results.push({
          collection: collectionName,
          success: true,
          imported: 'unknown',
          updated: 'unknown',
        });
        log('');
        continue;
      }

      await sleep(100);

      // Count after
      const countAfter = await col.countDocuments();
      log(`  After import:  ${countAfter} document(s)`);

      // ── Step 3: Inject tenantId ──
      const noTenantFilter = {
        $or: [
          { tenantId: { $exists: false } },
          { tenantId: null },
        ],
      };

      const needsUpdate = await col.countDocuments(noTenantFilter);

      if (needsUpdate > 0) {
        log(`  Found ${needsUpdate} document(s) without tenantId`);

        const updateResult = await col.updateMany(noTenantFilter, {
          $set: { tenantId: tenantId },
        });

        log(`  ✓ Updated ${updateResult.modifiedCount} document(s) with tenantId`);
      } else {
        log(`  All documents already have tenantId`);
      }

      // ── Step 4: Verify ──
      const stillMissing = await col.countDocuments(noTenantFilter);
      const withTenant = await col.countDocuments({ tenantId: tenantId });

      if (stillMissing > 0) {
        error(`  Verification failed: ${stillMissing} document(s) still missing tenantId`);
        results.push({
          collection: collectionName,
          success: false,
          imported: countAfter,
          updated: needsUpdate,
          error: `${stillMissing} documents still missing tenantId`,
        });
      } else {
        log(`  ✓ Verification passed: ${withTenant} document(s) have correct tenantId`);
        results.push({
          collection: collectionName,
          success: true,
          imported: countAfter,
          updated: needsUpdate,
          mode: useDrop ? 'DROP' : 'MERGE',
        });
      }

      log('');
    }

    // ── Summary ──
    log('='.repeat(SEPARATOR_WIDTH));
    log('Summary');
    log('='.repeat(SEPARATOR_WIDTH));

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    if (successful.length > 0) {
      log(`\n✓ Successfully processed (${successful.length}):`);
      successful.forEach(r => {
        const mode = r.mode ? ` [${r.mode}]` : '';
        log(`  - ${r.collection}: ${r.imported} imported, ${r.updated} updated${mode}`);
      });
    }

    if (failed.length > 0) {
      log(`\n✗ Failed (${failed.length}):`);
      failed.forEach(r => {
        log(`  - ${r.collection}: ${r.error}`);
      });
    }

    log(`\nDEFAULT tenantId: ${tenantId}`);
    log(`Target DB:        ${TARGET_DB}`);
    log(`Mode:             ${useDrop ? '⚠️  DROP' : '✓ MERGE'}`);
    if (dryRun) {
      log('\n*** This was a DRY RUN - run without --dry-run to apply changes ***');
    }
    log('='.repeat(SEPARATOR_WIDTH));

    process.exit(failed.length > 0 ? 1 : 0);

  } catch (err) {
    error(`\nFatal error: ${err.message}`);

    // Detect common auth/permission errors
    if (err.message && err.message.includes('Authentication failed')) {
      error('\n--- Auth Troubleshooting ---');
      error('The user credentials may not have access to write to app_db.');
      error('Try creating a user with broader privileges in MongoDB:');
      error('');
      error('  mongosh --port 27027');
      error('  use admin');
      error('  db.createUser({');
      error('    user: "admin",');
      error('    pwd: "HiNlsw2026.",');
      error('    roles: ["root"]');
      error('  })');
    } else if (err.message && err.message.includes('not authorized')) {
      error('\n--- Permission Troubleshooting ---');
      error('The current user lacks permission to write to app_db.');
      error('Grant the user readWrite or dbAdmin role on app_db, or use a root user.');
    }

    console.error(err.stack);
    process.exit(1);
  } finally {
    await client.close();
    log('\n✓ Disconnected from MongoDB');
  }
}

main();
