// MongoDB configuration
const mongoHost = process.env.MONGO_HOST || "localhost";
const mongoPort = process.env.MONGO_PORT || "27028";
const mongoDatabase = process.env.MONGO_DATABASE || "nldb";
const mongoUser = process.env.MONGO_USER || "";
const mongoPassword = process.env.MONGO_PASSWORD || "";
const mongoAuthSource = process.env.MONGO_AUTH_SOURCE || "admin";

// Build MongoDB connection string
function buildMongoUri() {
  if (process.env.MONGODB) {
    return process.env.MONGODB; // Allow full URI override
  }

  if (mongoUser && mongoPassword) {
    return `mongodb://${mongoUser}:${mongoPassword}@${mongoHost}:${mongoPort}/${mongoDatabase}?authSource=${mongoAuthSource}`;
  }

  return `mongodb://${mongoHost}:${mongoPort}/${mongoDatabase}`;
}

module.exports = {
  db: buildMongoUri(),
  port: process.env.PORT || 1081,
  env: process.env.NODE_ENV || "development",

  // MongoDB config (exposed for reference)
  mongo: {
    host: mongoHost,
    port: mongoPort,
    database: mongoDatabase,
    user: mongoUser,
  },

  development: {
    port: 1081,
    host: "127.0.0.1",
    errorHandlerOptions: { dumpExceptions: true, showStack: true },
  },
  production: {
    port: 1081,
    host: "127.0.0.1",
    errorHandlerOptions: { dumpExceptions: false, showStack: false },
  },

  sessionSecret: process.env.SESSION_SECRET || "Your Session Secret goes here",

  mailgun: {
    login:
      process.env.MAILGUN_LOGIN ||
      "postmaster@sandbox697fcddc09814c6b83718b9fd5d4e5dc.mailgun.org",
    password: process.env.MAILGUN_PASSWORD || "29eldds1uri6",
  },

  sendgrid: {
    user: process.env.SENDGRID_USER || "hslogin",
    password: process.env.SENDGRID_PASSWORD || "hspassword00",
  },

  companyName: process.env.COMPANY_NAME || "物流管理平台",
  deployMode: process.env.DEPLOY_MODE || "saas",
  standaloneCompany: process.env.STANDALONE_COMPANY || "",
};
