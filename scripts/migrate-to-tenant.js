/**
 * MongoDB 3.6 → 8.2 Migration Script
 *
 * Injects tenantId into all business collections and sets up user tenant fields.
 * Uses the NATIVE MongoDB driver (not Mongoose) to avoid triggering:
 *   - bcrypt password re-hashing (User pre-save hook)
 *   - mongoose tenant plugin (AsyncLocalStorage-based filtering)
 *
 * Usage:
 *   node scripts/migrate-to-tenant.js --dry-run   # Preview changes
 *   node scripts/migrate-to-tenant.js              # Execute migration
 *
 * Prerequisites:
 *   1. mongodump/mongorestore already completed (data in new DB)
 *   2. Sessions collection already dropped
 *   3. Run BEFORE starting the application (before standalone-init.js)
 *
 * Idempotent: Safe to run multiple times.
 */

require("dotenv").config();
// Use the native MongoDB driver bundled with mongoose (avoids extra install).
// We do NOT load Mongoose models, so no pre-save hooks or tenant plugin run.
const { MongoClient, ObjectId } = require("mongoose").mongo;

// ─── Configuration ──────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");

const COMPANY_NAME = process.env.COMPANY_NAME || "物流管理平台";

// 14 business collections that need tenantId
const BUSINESS_COLLECTIONS = [
  "bills",
  "brands",
  "companies",
  "destinations",
  "drayageforklifts",
  "invoices",
  "orderplans",
  "receiptimgs",
  "receiptimages",
  "saledeps",
  "settles",
  "vehicles",
  "vesselcosts",
  "warehouses",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildMongoUri() {
  if (process.env.MONGODB) {
    return process.env.MONGODB;
  }

  const host = process.env.MONGO_HOST || "localhost";
  const port = process.env.MONGO_PORT || "27027";
  const database = process.env.MONGO_DATABASE || "nldb";
  const user = process.env.MONGO_USER;
  const password = process.env.MONGO_PASSWORD;
  const authSource = process.env.MONGO_AUTH_SOURCE || "admin";

  if (user && password) {
    return `mongodb://${user}:${password}@${host}:${port}/${database}?authSource=${authSource}`;
  }
  return `mongodb://${host}:${port}/${database}`;
}

function log(msg) {
  const prefix = DRY_RUN ? "[DRY-RUN] " : "";
  console.log(`${prefix}${msg}`);
}

/**
 * Determine if a user document is an admin/owner candidate.
 */
function isAdminUser(user) {
  if (user.userid === "admin") return true;
  if (user.privilege === "11111111") return true;
  if (user.privilege === "admin") return true;
  if (Array.isArray(user.privilege) && user.privilege.includes("admin"))
    return true;
  return false;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function migrate() {
  const uri = buildMongoUri();
  const dbName = process.env.MONGO_DATABASE || "nldb";

  log("=".repeat(60));
  log("MongoDB Migration: Inject tenantId for standalone mode");
  log("=".repeat(60));
  if (DRY_RUN) {
    log("*** DRY RUN — no data will be modified ***");
  }
  log(`Database: ${dbName}`);
  log(`Company:  ${COMPANY_NAME}`);
  log("");

  const client = new MongoClient(uri);
  let currentStep = "";

  try {
    await client.connect();
    log("✓ Connected to MongoDB");

    const db = client.db(dbName);
    const stats = { tenant: null, users: 0, owners: 0, collections: {} };

    // Enumerate existing collections for validation
    const existingCollections = new Set(
      (await db.listCollections().toArray()).map((c) => c.name),
    );

    // ── Step 1: Create or find DEFAULT tenant ───────────────────────────
    currentStep = "Step 1: Ensure DEFAULT tenant";
    log("\n── Step 1: Ensure DEFAULT tenant ──");

    const tenantsCol = db.collection("tenants");

    if (DRY_RUN) {
      const existing = await tenantsCol.findOne({ code: "DEFAULT" });
      if (existing) {
        log(`  DEFAULT tenant already exists: ${existing._id}`);
        stats.tenant = existing._id;
      } else {
        log("  Would create DEFAULT tenant");
        stats.tenant = null;
      }
    } else {
      const result = await tenantsCol.findOneAndUpdate(
        { code: "DEFAULT" },
        {
          $setOnInsert: {
            code: "DEFAULT",
            name: COMPANY_NAME,
            fullName: COMPANY_NAME,
            plan: "enterprise",
            maxUsers: 999,
            status: "active",
            creator: "migration-script",
            createDate: new Date(),
          },
        },
        { upsert: true, returnDocument: "after" },
      );
      stats.tenant = result._id;
      log(`  ✓ DEFAULT tenant: ${result._id} (${result.name})`);
    }

    const tenantId = stats.tenant;

    // ── Step 2: Migrate users ───────────────────────────────────────────
    currentStep = "Step 2: Migrate users";
    log("\n── Step 2: Migrate users ──");

    const usersCol = db.collection("users");
    const noTenantFilter = {
      $or: [{ tenantId: { $exists: false } }, { tenantId: null }],
    };

    // Get all users without tenantId (with their privilege info for role determination)
    const usersWithoutTenant = await usersCol
      .find(noTenantFilter)
      .project({ _id: 1, userid: 1, privilege: 1 })
      .toArray();

    log(`  Users without tenantId: ${usersWithoutTenant.length}`);

    if (usersWithoutTenant.length > 0) {
      // Classify each user: admin → owner, everyone else → member
      const ownerCandidates = usersWithoutTenant.filter(isAdminUser);
      const memberUsers = usersWithoutTenant.filter((u) => !isAdminUser(u));

      log(
        `  Owner candidates: ${ownerCandidates.map((u) => u.userid).join(", ") || "(none)"}`,
      );
      log(`  Member users: ${memberUsers.length}`);

      if (!DRY_RUN) {
        // Use bulkWrite to set correct role per user in a single operation
        const bulkOps = [];

        for (const user of ownerCandidates) {
          bulkOps.push({
            updateOne: {
              filter: { _id: user._id },
              update: {
                $set: {
                  tenantId: tenantId,
                  tenantCode: "DEFAULT",
                  role: "owner",
                },
              },
            },
          });
        }

        for (const user of memberUsers) {
          bulkOps.push({
            updateOne: {
              filter: { _id: user._id },
              update: {
                $set: {
                  tenantId: tenantId,
                  tenantCode: "DEFAULT",
                  role: "member",
                },
              },
            },
          });
        }

        if (bulkOps.length > 0) {
          const bulkResult = await usersCol.bulkWrite(bulkOps);
          stats.users = bulkResult.modifiedCount;
          stats.owners = ownerCandidates.length;
          log(
            `  ✓ Updated ${bulkResult.modifiedCount} user(s) (${ownerCandidates.length} owner, ${memberUsers.length} member)`,
          );
        }
      } else {
        stats.users = usersWithoutTenant.length;
        stats.owners = ownerCandidates.length;
        log(
          `  Would update ${usersWithoutTenant.length} user(s) (${ownerCandidates.length} owner, ${memberUsers.length} member)`,
        );
      }
    } else {
      log("  No users need migration");
    }

    // Fallback: ensure at least one owner exists for DEFAULT tenant
    if (!DRY_RUN && tenantId) {
      const existingOwner = await usersCol.findOne({
        tenantId: tenantId,
        role: "owner",
      });
      if (!existingOwner) {
        const adminUser = await usersCol.findOne({
          tenantId: tenantId,
          userid: "admin",
        });
        if (adminUser) {
          await usersCol.updateOne(
            { _id: adminUser._id },
            { $set: { role: "owner" } },
          );
          stats.owners = 1;
          log("  ✓ Fallback: promoted admin user to owner");
        }
      }
    }

    // ── Step 3: Migrate business collections ────────────────────────────
    currentStep = "Step 3: Migrate business collections";
    log("\n── Step 3: Migrate business collections ──");

    for (const colName of BUSINESS_COLLECTIONS) {
      if (!existingCollections.has(colName)) {
        log(`  ⚠ ${colName}: collection does not exist, skipping`);
        stats.collections[colName] = "N/A";
        continue;
      }

      const col = db.collection(colName);
      const filter = { tenantId: { $exists: false } };
      const count = await col.countDocuments(filter);

      if (count > 0) {
        if (!DRY_RUN && tenantId) {
          const result = await col.updateMany(filter, {
            $set: { tenantId: tenantId },
          });
          log(`  ✓ ${colName}: ${result.modifiedCount} document(s) updated`);
          stats.collections[colName] = result.modifiedCount;
        } else {
          log(`  ${colName}: ${count} document(s) would be updated`);
          stats.collections[colName] = count;
        }
      } else {
        log(`  ${colName}: 0 documents need migration`);
        stats.collections[colName] = 0;
      }
    }

    // ── Step 4: Verification ────────────────────────────────────────────
    currentStep = "Step 4: Verification";
    log("\n── Step 4: Verification ──");

    if (DRY_RUN && !tenantId) {
      log("  (dry-run: DEFAULT tenant not yet created, skipping verification)");
    } else {
      let allGood = true;

      // Check users
      const usersNoTenant = await usersCol.countDocuments(noTenantFilter);
      const ownerCount = await usersCol.countDocuments({
        tenantId: tenantId,
        role: "owner",
      });
      if (usersNoTenant > 0) {
        log(`  ✗ users: ${usersNoTenant} document(s) still missing tenantId`);
        allGood = false;
      } else {
        const totalUsers = await usersCol.countDocuments();
        log(`  ✓ users: ${totalUsers} document(s), all have tenantId`);
      }
      log(`    owners for DEFAULT tenant: ${ownerCount}`);
      if (ownerCount === 0 && !DRY_RUN) {
        log(
          "  ⚠ WARNING: No owner found — standalone-init will create one on startup",
        );
        allGood = false;
      }

      // Check business collections
      for (const colName of BUSINESS_COLLECTIONS) {
        if (!existingCollections.has(colName)) continue;

        const col = db.collection(colName);
        const missing = await col.countDocuments({
          tenantId: { $exists: false },
        });
        const total = await col.countDocuments();
        if (missing > 0) {
          log(`  ✗ ${colName}: ${missing}/${total} missing tenantId`);
          allGood = false;
        } else {
          log(`  ✓ ${colName}: ${total} document(s), all have tenantId`);
        }
      }

      // ── Summary ─────────────────────────────────────────────────────────
      log("\n" + "=".repeat(60));
      log("Migration Summary");
      log("=".repeat(60));
      log(`  Tenant ID:    ${tenantId}`);
      log(`  Users:        ${stats.users} migrated (${stats.owners} owner)`);
      log(
        `  Collections:  ${Object.entries(stats.collections)
          .map(([k, v]) => `${k}(${v})`)
          .join(", ")}`,
      );
      log(
        `  Status:       ${allGood ? "✓ ALL GOOD" : "⚠ ISSUES FOUND (see above)"}`,
      );
      if (DRY_RUN) {
        log(
          "\n  *** This was a DRY RUN — run without --dry-run to apply changes ***",
        );
      }
      log("=".repeat(60));
    }
  } catch (error) {
    console.error(`\n✗ Migration failed at ${currentStep}:`, error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.close();
    log("\n✓ Disconnected from MongoDB");
  }
}

migrate();
