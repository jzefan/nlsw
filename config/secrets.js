module.exports = {
  db: process.env.MONGODB|| 'mongodb://localhost:27017/test',
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',

  development: {
    port: 3000,
    host: "127.0.0.1",
    errorHandlerOptions: {"dumpExceptions": true, "showStack": true}
  },
  production: {
    port: 3000,
    host: "127.0.0.1",
    errorHandlerOptions: {"dumpExceptions": false, "showStack": false}
  },

  sessionSecret: process.env.SESSION_SECRET || 'Your Session Secret goes here',

  mailgun: {
    login: process.env.MAILGUN_LOGIN || 'postmaster@sandbox697fcddc09814c6b83718b9fd5d4e5dc.mailgun.org',
    password: process.env.MAILGUN_PASSWORD || '29eldds1uri6'
  },

  sendgrid: {
    user: process.env.SENDGRID_USER || 'hslogin',
    password: process.env.SENDGRID_PASSWORD || 'hspassword00'
  }
};
