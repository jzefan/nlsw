/**
 * Module dependencies.
 */

var express = require('express');
var cookieParser = require('cookie-parser');
var compress = require('compression');
var session = require('express-session');
var bodyParser = require('body-parser');
var favicon = require('serve-favicon');
var logger = require('morgan');
var errorHandler = require('errorhandler');
//var csrf = require('csurf');
var methodOverride = require('method-override');

var MongoStore = require('connect-mongo')({ session: session });
var flash = require('express-flash');
var path = require('path');
var mongoose = require('mongoose');
var passport = require('passport');
var expressValidator = require('express-validator');
var connectAssets = require('connect-assets');
var routes = require('./routes');

const dataCfg = require('./controllers/cache');

/**
 * API keys.
 */

var secrets = require('./config/secrets');

/**
 * Create Express server.
 */

var app = express();

/**
 * Mongoose configuration.
 */

//mongoose.set('debug', true);
mongoose.connect(secrets.db);
mongoose.connection.on('error', function(err) {
  console.error('✗ MongoDB Connection Error: %s', err);
});

/**
 * Express configuration.
 */

var hour = 3600000;
var day = hour * 24;
var week = day * 7;

app.set('env', secrets.env);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
if (secrets.env === 'production') {
  app.enable('view cache');
}
app.use('/', connectAssets({
  paths: ['public/css', 'public/js'],
  helperContext: app.locals
}));
app.use(compress());
app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json({limit:'50mb'}));
app.use(bodyParser.urlencoded({limit:'50mb', extended: true}));
app.use(expressValidator());
app.use(methodOverride());
app.use(cookieParser());
app.use(session({
  secret: secrets.sessionSecret,
  store: new MongoStore({
    url: secrets.db,
    autoReconnect: true
  }),
  resave: true,
  saveUninitialized: true
}));

//app.use(csrf());
app.use(passport.initialize());
app.use(passport.session());
app.use(function(req, res, next) {
  res.locals.user = req.user;
  //res.locals._csrf = req.csrfToken();
  res.locals.secrets = secrets;
  res.locals.scripts = [];
  next();
});

app.use(flash());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: week }));
app.use(function(req, res, next) {
  // Keep track of previous URL
  if (req.method !== 'GET') return next();
  var path = req.path.split('/')[1];
  if (/(auth|login|logout|signup)$/i.test(path)) return next();
  req.session.returnTo = req.path;
  next();
});

/**
 * Application routes.
 */

routes(app);

// 404 error handler
app.use(function(req, res) {
  res.status(404);
  res.render('404');
});

// 500 error handler
app.use(errorHandler());

/**
 * Start Express server.
 */

app.listen(secrets.port, function() {
  console.log("✔ Express server listening on port %d in %s mode", secrets.port, secrets.env);
});

module.exports = app;
