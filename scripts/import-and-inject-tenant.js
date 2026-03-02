/**
 * Import Collection(s) from Backup and Inject tenantId
 *
 * Imports one or more collections from backup directory and automatically
 * injects DEFAULT tenant's _id into all imported documents.
 *
 * Usage:
 *   node scripts/import-and-inject-tenant.js [options] <collection1> [collection2] ...
 *
 * Examples:
 *   node scripts/import-and-inject-tenant.js bills
 *   node scripts/import-and-inject-tenant.js bills invoices vehicles
 *   node scripts/import-and-inject-tenant.js --dir=/backup/nldb bills
 *   node scripts/import-and-inject-tenant.js --dry-run bills
 *   node scripts/import-and-inject-tenant.js --drop bills  # ⚠️ 危险：会删除现有数据
 *
 * Options:
 *   --dir=<path>   Custom backup directory (default: data/backup/test-db_20260228/test)
 *   --dry-run      Preview changes without importing data
 *   --drop         ⚠️ DROP existing collection before import (DELETES ALL DATA!)
 *                  Default: merge mode (upsert based on _id, preserves existing data)
 *
 * IMPORTANT - Data Preservation:
 *   - Default mode (no --drop): MERGES data, preserves existing documents
 *   - With --drop flag: DELETES all existing data before import
 *   - Always use --dry-run first to preview changes
 *
 * Prerequisites:
 *   - Backup directory contains .bson files for the collections
 *   - DEFAULT tenant exists in current database
 *   - mongorestore is in PATH
 */

require('dotenv').config();
const { MongoClient } = require('mongoose').mongo;
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ─── Configuration ──��───────────────────────────────────────────────────────

const TARGET_DB = process.env.MONGO_DATABASE || 'nldb_saas';

// MongoDB connection config
const MONGO_HOST = process.env.MONGO_HOST || 'localhost';
const MONGO_PORT = process.env.MONGO_PORT || '27027';
const MONGO_USER = process.env.MONGO_USER;
const MONGO_PASSWORD = process.env.MONGO_PASSWORD;
const MONGO_AUTH_SOURCE = process.env.MONGO_AUTH_SOURCE || 'admin';

const SEPARATOR_WIDTH = 60;

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildMongoUri() {
  if (process.env.MONGODB) {
    return process.env.MONGODB;
  }

  if (MONGO_USER && MONGO_PASSWORD) {
    return `mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/${TARGET_DB}?authSource=${MONGO_AUTH_SOURCE}`;
  }
  return `mongodb://${MONGO_HOST}:${MONGO_PORT}/${TARGET_DB}`;
}

/**
 * Redact sensitive information from text
 * @param {string} text
 * @returns {string}
 */
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

/**
 * Validate collection name (prevent path traversal)
 * @param {string} name
 * @returns {boolean}
 */
function isValidCollectionName(name) {
  // MongoDB collection names: alphanumeric, underscore, hyphen only
  // No path separators, no special characters
  return /^[a-zA-Z0-9_-]+$/.test(name) && !name.includes('..');
}

/**
 * Check if mongorestore is available
 * @returns {boolean}
 */
function checkMongoRestore() {
  try {
    execSync('mongorestore --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Import a collection using mongorestore
 * @param {string} collectionName
 * @param {string} bsonFile
 * @param {boolean} dryRun
 * @param {boolean} useDrop
 * @returns {Promise<{success: boolean, count?: number, error?: string}>}
 */
function importCollection(collectionName, bsonFile, dryRun, useDrop) {
  if (dryRun) {
    const mode = useDrop ? '[DROP+IMPORT]' : '[MERGE]';
    log(`  [DRY-RUN] Would import ${collectionName} ${mode} from ${path.basename(bsonFile)}`);
    return Promise.resolve({ success: true, count: 'unknown' });
  }

  const mode = useDrop ? 'DROP+IMPORT' : 'MERGE';
  log(`  Importing ${collectionName} (${mode} mode)...`);

  // Build mongorestore arguments (safer than string concatenation)
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

  // Only use --drop if explicitly requested
  if (useDrop) {
    args.push('--drop');
  }

  return new Promise((resolve) => {
    const proc = spawn('mongorestore', args, {
      stdio: ['ignore', 'pipe', 'pipe']
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
        // Parse the output to get document count
        const match = output.match(/(\d+) document\(s\)/);
        const count = match ? parseInt(match[1]) : 'unknown';
        log(`  ✓ Imported ${count} document(s)`);
        resolve({ success: true, count });
      } else {
        // Redact sensitive info from error messages
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

/**
 * Sleep for specified milliseconds
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);

  // Extract flags
  const dryRun = args.includes('--dry-run');
  const useDrop = args.includes('--drop');
  const dirFlag = args.find(arg => arg.startsWith('--dir='));
  const customBackupDir = dirFlag ? dirFlag.split('=')[1] : null;

  // Get collection names (filter out flags)
  const collections = args.filter(arg => !arg.startsWith('--')).filter(name => {
    if (!isValidCollectionName(name)) {
      error(`Invalid collection name: ${name} (only alphanumeric, underscore, hyphen allowed)`);
      return false;
    }
    return true;
  });

  // Default backup directory
  const BACKUP_DIR = customBackupDir ||
    path.resolve(__dirname, '../data/backup/test-db_20260228/test');

  if (collections.length === 0) {
    console.log(`
Usage: node scripts/import-and-inject-tenant.js [options] <collection1> [collection2] ...

Examples:
  node scripts/import-and-inject-tenant.js bills
  node scripts/import-and-inject-tenant.js bills invoices vehicles
  node scripts/import-and-inject-tenant.js --dir=/backup/nldb bills
  node scripts/import-and-inject-tenant.js --dry-run bills

Options:
  --dir=<path>   Custom backup directory (default: data/backup/test-db_20260228/test)
  --dry-run      Preview changes without importing data
  --drop         ⚠️  DROP collection before import (DELETES ALL EXISTING DATA!)

Data Preservation Modes:
  1. Default (no --drop): MERGE mode - Upserts documents by _id, preserves existing data
  2. With --drop flag:    DROP mode  - Deletes all data before import (⚠️  DANGEROUS!)

Available collections in backup directory:
`);

    // List available collections in backup
    if (fs.existsSync(BACKUP_DIR)) {
      const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.bson'))
        .map(f => f.replace('.bson', ''));

      if (files.length > 0) {
        files.forEach(f => console.log(`  - ${f}`));
      } else {
        console.log('  (no .bson files found)');
      }
      console.log(`\nBackup directory: ${BACKUP_DIR}`);
    } else {
      console.log(`  ✗ Backup directory not found: ${BACKUP_DIR}`);
    }

    process.exit(1);
  }

  // Check for mongorestore
  if (!dryRun && !checkMongoRestore()) {
    error('mongorestore not found in PATH.');
    error('Install MongoDB Database Tools: https://www.mongodb.com/try/download/database-tools');
    process.exit(1);
  }

  log('='.repeat(SEPARATOR_WIDTH));
  log('Import Collections and Inject tenantId');
  log('='.repeat(SEPARATOR_WIDTH));
  if (dryRun) {
    log('*** DRY RUN - No data will be modified ***');
  }
  log(`Backup dir: ${BACKUP_DIR}`);
  log(`Target DB:  ${TARGET_DB}`);
  log(`Mode:       ${useDrop ? '⚠️  DROP (deletes existing data)' : '✓ MERGE (preserves existing data)'}`);
  log(`Collections: ${collections.join(', ')}`);
  log('');

  // Verify backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    error(`Backup directory not found: ${BACKUP_DIR}`);
    process.exit(1);
  }

  // Verify all collections exist in backup
  log('── Verifying backup files ──');
  let allExist = true;
  for (const col of collections) {
    const bsonFile = path.join(BACKUP_DIR, `${col}.bson`);
    if (fs.existsSync(bsonFile)) {
      log(`  ✓ ${col}.bson found`);
    } else {
      error(`  ${col}.bson not found`);
      allExist = false;
    }
  }

  if (!allExist) {
    error('Some backup files are missing. Aborting.');
    process.exit(1);
  }

  log('');

  // WARNING for --drop mode
  if (useDrop && !dryRun) {
    log('⚠️  ⚠️  ⚠️  DANGER: --drop MODE ENABLED ⚠️  ⚠️  ⚠️');
    log('   ALL EXISTING DATA in these collections will be DELETED:');
    collections.forEach(c => log(`     - ${c}`));
    log('');
    log('   If you want to PRESERVE existing data, press Ctrl+C now');
    log('   and run WITHOUT --drop flag (default is MERGE mode).');
    log('');
    log('   Waiting 10 seconds before proceeding...');
    log('');
    await sleep(10000);
  } else if (!dryRun) {
    log('✓ Using MERGE mode - existing data will be preserved');
    log('  Documents with same _id will be updated, new documents will be added');
    log('');
    log('  Starting in 3 seconds... (Ctrl+C to cancel)');
    await sleep(3000);
  }

  // Connect to MongoDB
  const uri = buildMongoUri();
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  });

  try {
    await client.connect();
    log('✓ Connected to MongoDB\n');

    const db = client.db(TARGET_DB);

    // Get DEFAULT tenant ID
    log('── Getting DEFAULT tenant ID ──');
    const tenantsCol = db.collection('tenants');
    const defaultTenant = await tenantsCol.findOne({ code: 'DEFAULT' });

    if (!defaultTenant) {
      error('DEFAULT tenant not found. Please run migration script first or start the application once.');
      process.exit(1);
    }

    const tenantId = defaultTenant._id;
    log(`  ✓ DEFAULT tenant: ${tenantId}\n`);

    // Import and update each collection
    const results = [];

    for (const collectionName of collections) {
      log('─'.repeat(SEPARATOR_WIDTH));
      log(`Processing: ${collectionName}`);
      log('─'.repeat(SEPARATOR_WIDTH));

      const col = db.collection(collectionName);
      const bsonFile = path.join(BACKUP_DIR, `${collectionName}.bson`);

      // Step 1: Get count before import
      const countBefore = await col.countDocuments();
      log(`  Before import: ${countBefore} document(s)`);

      // Step 2: Import collection
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

      // Step 3: Wait a moment for DB to settle
      await sleep(100);

      // Step 4: Get count after import
      const countAfter = await col.countDocuments();
      log(`  After import:  ${countAfter} document(s)`);

      // Step 5: Update tenantId for documents that don't have it
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

      // Step 6: Verification
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

    // Summary
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

    log('\n' + '='.repeat(SEPARATOR_WIDTH));
    log(`Total: ${successful.length} succeeded, ${failed.length} failed`);
    log(`Mode:  ${useDrop ? '⚠️  DROP (deleted existing data)' : '✓ MERGE (preserved existing data)'}`);
    if (dryRun) {
      log('\n*** This was a DRY RUN - run without --dry-run to apply changes ***');
    }
    log('='.repeat(SEPARATOR_WIDTH));

    process.exit(failed.length > 0 ? 1 : 0);

  } catch (err) {
    error(`\nFatal error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await client.close();
    log('\n✓ Disconnected from MongoDB');
  }
}

main();
