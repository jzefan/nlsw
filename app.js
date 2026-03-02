/**
 * Module dependencies.
 */

process.env.TZ = "Asia/Shanghai";

require("dotenv").config({ path: process.env.ENV_FILE || ".env" });

const schedule = require("node-schedule");
var express = require("express");
var cookieParser = require("cookie-parser");
var compress = require("compression");
var session = require("express-session");
// var bodyParser = require('body-parser'); // Removed: Express 4.16+ has built-in body parsing
var favicon = require("serve-favicon");
var logger = require("morgan");
var errorHandler = require("errorhandler");
//var csrf = require('csurf');
var methodOverride = require("method-override");
var cors = require("cors");

var { MongoStore } = require("connect-mongo"); // Updated for connect-mongo 6.x
var flash = require("express-flash");
var path = require("path");
var mongoose = require("mongoose");

// Global tenant plugin — must be registered BEFORE any model is require()'d
const mongooseTenantPlugin = require("./utils/mongoose-tenant-plugin");
mongoose.plugin(mongooseTenantPlugin);

var passport = require("passport");
var connectAssets = require("connect-assets");
var routes = require("./routes");
var routesApi = require("./routes_api");
let ReceiptImg = require("./models/Receipt");
let ArchivedReceiptImg = require("./models/ArchivedReceiptImg");

const dataCfg = require("./controllers/cache");
const { migrateAllUsers } = require("./utils/privilege-migration");
const User = require("./models/User");
const { isStandalone } = require("./utils/deploy-mode");
const { initStandalone } = require("./utils/standalone-init");

/**
 * API keys.
 */

var secrets = require("./config/secrets");

/**
 * Create Express server.
 */

var app = express();

/**
 * Mongoose configuration.
 */

//mongoose.set('debug', true);
mongoose
  .connect(secrets.db)
  .then(async () => {
    migrateAllUsers(User).catch((err) => {
      console.error("✗ Privilege migration error:", err);
    });

    if (isStandalone()) {
      try {
        await initStandalone();
        console.log("✔ Standalone mode initialized");
      } catch (err) {
        console.error("✗ Standalone init error:", err);
      }
    }
  })
  .catch((err) => {
    console.error("✗ MongoDB Connection Error: %s", err);
  });

/**
 * Express configuration.
 */

var hour = 3600000;
var day = hour * 24;
var week = day * 7;

app.set("env", secrets.env);
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug"); // Changed from 'jade' - Pug is the official successor
if (secrets.env === "production") {
  app.enable("view cache");
}
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);
app.use(
  "/",
  connectAssets({
    paths: ["public/css", "public/js"],
    helperContext: app.locals,
  }),
);
app.use(compress());
app.use(favicon(__dirname + "/public/favicon.ico"));
app.use(logger("dev"));
app.use(express.json({ limit: "50mb" })); // Using Express built-in body parser
app.use(express.urlencoded({ limit: "50mb", extended: true })); // Using Express built-in body parser
app.use(methodOverride());
app.use(cookieParser());
app.use(
  session({
    secret: secrets.sessionSecret,
    store: MongoStore.create({
      mongoUrl: secrets.db,
    }),
    resave: true,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      maxAge: week,
    },
  }),
);

//app.use(csrf());
app.use(passport.initialize());
app.use(passport.session());

// Tenant context middleware - sets req.tenantId, req.tenant, req.isPlatformUser
const { tenantContext } = require("./middleware/tenantContext");
app.use(tenantContext);

const { migrateArrayToBinary } = require("./utils/privilege-migration");
app.use(function (req, res, next) {
  // 为旧 Pug 模板兼容：将权限数组转换为二进制字符串格式
  if (req.user && Array.isArray(req.user.privilege)) {
    const userForTemplate = {
      ...(req.user.toObject ? req.user.toObject() : req.user),
      privilege: migrateArrayToBinary(req.user.privilege),
    };
    res.locals.user = userForTemplate;
  } else {
    res.locals.user = req.user;
  }
  //res.locals._csrf = req.csrfToken();
  res.locals.secrets = secrets;
  res.locals.companyName = secrets.companyName;
  res.locals.scripts = [];
  next();
});

app.use(flash());
app.use(express.static(path.join(__dirname, "public"), { maxAge: week }));
app.use(function (req, res, next) {
  // Keep track of previous URL
  if (req.method !== "GET") return next();
  var path = req.path.split("/")[1];
  if (/(auth|login|logout|signup)$/i.test(path)) return next();
  // Exclude .well-known paths
  if (req.path.startsWith("/.well-known")) return next();
  req.session.returnTo = req.path;
  next();
});

/**
 * Application routes.
 */

routesApi(app);
routes(app);

// 定时任务，每天早上3点执行
let rule = new schedule.RecurrenceRule();
rule.hour = 16;
rule.minute = 28;

let job = schedule.scheduleJob(rule, async () => {
  const halfYearAgo = new Date();
  halfYearAgo.setMonth(halfYearAgo.getMonth() - 6);
  console.log("start archive data...", halfYearAgo);

  const cursor = await ReceiptImg.find({
    create_time: { $lt: halfYearAgo },
  }).exec();

  for (const doc of cursor) {
    const archivedDoc = new ArchivedReceiptImg({
      inv_no: doc.inv_no,
      status: doc.status,
      data: doc.data,
      contentType: doc.contentType,
      create_time: doc.create_time,
      creator: doc.creator,
    });

    await archivedDoc.save();
    await ReceiptImg.deleteOne({ _id: doc._id });
  }
  console.log("end archive data...", halfYearAgo);
});

// SaaS 定时任务：每天凌晨3点自动暂停已过期的租户
const { isSaas } = require('./utils/deploy-mode');
const Tenant = require('./models/Tenant');

if (isSaas()) {
  let suspendRule = new schedule.RecurrenceRule();
  suspendRule.hour = 3;
  suspendRule.minute = 0;

  schedule.scheduleJob(suspendRule, async () => {
    try {
      const now = new Date();
      const result = await Tenant.updateMany(
        { status: 'active', expireDate: { $lt: now, $ne: null } },
        { $set: { status: 'suspended' } }
      );
      if (result.modifiedCount > 0) {
        console.log(`[auto-suspend] Suspended ${result.modifiedCount} expired tenant(s)`);
      }
    } catch (err) {
      console.error('[auto-suspend] Error:', err);
    }
  });
}

// 404 error handler
app.use(function (req, res) {
  res.status(404);
  res.render("404");
});

// 500 error handler
app.use(errorHandler());

/**
 * Start Express server.
 */

app.listen(secrets.port, function () {
  console.log(
    "✔ Express server listening on port %d in %s mode",
    secrets.port,
    secrets.env,
  );
});

module.exports = app;
