var _ = require('underscore');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var User = require('../models/User');
var secrets = require('./secrets');

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(async function(id, done) {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Sign in using userid and Password.
passport.use(new LocalStrategy({ usernameField: 'userid' }, async function(userid, password, done) {
  try {
    console.log('Passport Strategy: Attempting login for userid:', userid);
    const user = await User.findOne({ userid: userid });
    console.log('Passport Strategy: Find result:', user ? 'User found' : 'User NOT found');
    
    if (!user) return done(null, false, { message: '用户名 ' + userid + ' 不存在!'});
    
    const isMatch = await user.comparePassword(password);
    console.log('Passport Strategy: Password match:', isMatch);

    if (isMatch) {
      return done(null, user);
    } else {
      return done(null, false, { message: '密码不正确' });
    }
  } catch (err) {
    console.error('Passport Strategy Error:', err);
    return done(err);
  }
}));


// Login Required middleware.
exports.isAuthenticated = function(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
};

// Authorization Required middleware.
exports.isAuthorized = function(req, res, next) {
  var provider = req.path.split('/').slice(-1)[0];

  if (_.findWhere(req.user.tokens, { kind: provider })) {
    next();
  } else {
    res.redirect('/auth/' + provider);
  }
};
