var _ = require('underscore');
var colors = require('colors');
var fs = require('fs');
var inquirer = require('inquirer');
var M = require('mstring');
var os = require('os');
var User = require('./models/User'); // Assuming this script is run from the root, so path is correct

colors.setTheme({
  silly: 'rainbow',
  input: 'grey',
  verbose: 'cyan',
  prompt: 'grey',
  info: 'green',
  data: 'grey',
  help: 'white',
  warn: 'yellow',
  debug: 'blue',
  error: 'red'
});

inquirer.prompt({
  type: 'list',
  name: 'category',
  message: 'Hackathon Starter:',
  choices: ['☂ Authentication', '☎ Email Service', '☱ Exit']
}, function(answer) {

  if (answer.category.match('Email Service')) {
    inquirer.prompt({
      type: 'list',
      name: 'email',
      message: 'Choose Email Delivery Service:',
      choices: ['SendGrid', 'Mailgun', 'Cancel']
    }, function(answer) {

      var index;

      var contactControllerFile = 'controllers/contact.js';
      var userControllerFile = 'controllers/user.js';

      var contactController = fs.readFileSync(contactControllerFile).toString().split(os.EOL);
      var userController = fs.readFileSync(userControllerFile).toString().split(os.EOL);

      if (answer.email.match('SendGrid')) {

        // Change SMPT Transport to SendGrid in controllers/contact.js
        index = contactController.indexOf('var smtpTransport = nodemailer.createTransport(\'SMTP\', {');
        contactController.splice(index + 1, 1, '  service: \'SendGrid\',');
        contactController.splice(index + 3, 1, '       user: secrets.sendgrid.user,');
        contactController.splice(index + 4, 1, '       pass: secrets.sendgrid.password');
        fs.writeFileSync(contactControllerFile, contactController.join(os.EOL));

        // Change SMPT Transport to SendGrid in controllers/user.js
        index = userController.indexOf('      var smtpTransport = nodemailer.createTransport(\'SMTP\', {');
        userController.splice(index + 1, 1, '        service: \'SendGrid\',');
        userController.splice(index + 3, 1, '          user: secrets.sendgrid.user,');
        userController.splice(index + 4, 1, '          pass: secrets.sendgrid.password');
        index = userController.indexOf('      var smtpTransport = nodemailer.createTransport(\'SMTP\', {', 1);
        userController.splice(index + 1, 1, '        service: \'SendGrid\',');
        userController.splice(index + 3, 1, '          user: secrets.sendgrid.user,');
        userController.splice(index + 4, 1, '          pass: secrets.sendgrid.password');
        fs.writeFileSync(userControllerFile, userController.join(os.EOL));

        console.log('✓ Email Delivery Service has been switched to'.info, 'SendGrid'.help);
      }

      if (answer.email.match('Mailgun')) {

        // Change SMPT Transport to Mailgun in controllers/contact.js
        index = contactController.indexOf('var smtpTransport = nodemailer.createTransport(\'SMTP\', {');
        contactController.splice(index + 1, 1, '  service: \'Mailgun\',');
        contactController.splice(index + 3, 1, '       user: secrets.mailgun.login,');
        contactController.splice(index + 4, 1, '       pass: secrets.mailgun.password');
        fs.writeFileSync(contactControllerFile, contactController.join(os.EOL));

        // Change SMPT Transport to Mailgun in controllers/user.js
        index = userController.indexOf('      var smtpTransport = nodemailer.createTransport(\'SMTP\', {');
        userController.splice(index + 1, 1, '        service: \'Mailgun\',');
        userController.splice(index + 3, 1, '          user: secrets.mailgun.login,');
        userController.splice(index + 4, 1, '          pass: secrets.mailgun.password');
        index = userController.indexOf('      var smtpTransport = nodemailer.createTransport(\'SMTP\', {', 1);
        userController.splice(index + 1, 1, '        service: \'Mailgun\',');
        userController.splice(index + 3, 1, '          user: secrets.mailgun.login,');
        userController.splice(index + 4, 1, '          pass: secrets.mailgun.password');
        fs.writeFileSync(userControllerFile, userController.join(os.EOL));

        console.log('✓ Email Delivery Service has been switched to'.info, '@'.error + 'mail'.data + 'gun'.error);
      }
    });
  }

  if (answer.category.match('Authentication')) {
    inquirer.prompt({
      type: 'checkbox',
      message: 'Select Authentication Providers',
      name: 'auth',
      choices: [
        new inquirer.Separator(M(function() {
          /***

           ╔══════════════════════════════════════════════════════════════════════╗
           ║ THIS TOOL IS STILL IN EXPERIMENTAL STAGE! USE AT YOUR OWN RISK.      ║
           ║ ALWAYS USE VERSION CONTROL SYSTEM SO YOU COULD REVERT THE CHANGES.   ║
           ║ REPORT BUGS AT HTTPS://GITHUB.COM/SAHAT/HACKATHON-STARTER/ISSUES/NEW ║
           ╚══════════════════════════════════════════════════════════════════════╝

          ***/
        })),
        { name: 'Facebook', checked: true },
        { name: 'GitHub', checked: true },
        { name: 'Google', checked: true },
        { name: 'Twitter', checked: true },
        { name: 'LinkedIn', checked: true },
        { name: 'Instagram' },
        new inquirer.Separator('Press ctrl+c to cancel'.warn)
      ]
    }, function(answer) {
      var index;

      var passportConfigFile = 'config/passport.js';
      var userModelFile = 'models/User.js';
      var appFile = 'app.js';
      var secretsFile = 'config/secrets.js';
      var profileTemplateFile = 'views/account/profile.jade';
      var loginTemplateFile = 'views/account/login.jade';

      var passportConfig = fs.readFileSync(passportConfigFile).toString().split(os.EOL);
      var loginTemplate = fs.readFileSync(loginTemplateFile).toString().split(os.EOL);
      var profileTemplate = fs.readFileSync(profileTemplateFile).toString().split(os.EOL);
      var userModel = fs.readFileSync(userModelFile).toString().split(os.EOL);
      var app = fs.readFileSync(appFile).toString().split(os.EOL);
      var secrets = fs.readFileSync(secretsFile).toString().split(os.EOL);

      var facebookStrategy = M(function() {
        /*** 
        // Sign in with Facebook.

        passport.use(new FacebookStrategy(secrets.facebook, async function(req, accessToken, refreshToken, profile, done) {
          try {
            if (req.user) {
              const existingUser = await User.findOne({ $or: [{ facebook: profile.id }, { email: profile.email }] }).exec();
              if (existingUser) {
                req.flash('errors', { msg: 'There is already a Facebook account that belongs to you. Sign in with that account or delete it, then link it with your current account.' });
                return done(null);
              }
              const user = await User.findById(req.user.id).exec();
              user.facebook = profile.id;
              user.tokens.push({ kind: 'facebook', accessToken: accessToken });
              user.profile.name = user.profile.name || profile.displayName;
              user.profile.gender = user.profile.gender || profile._json.gender;
              user.profile.picture = user.profile.picture || 'https://graph.facebook.com/' + profile.id + '/picture?type=large';
              await user.save();
              req.flash('info', { msg: 'Facebook account has been linked.' });
              done(null, user);
            } else {
              const existingUser = await User.findOne({ facebook: profile.id }).exec();
              if (existingUser) return done(null, existingUser);
              const existingEmailUser = await User.findOne({ email: profile._json.email }).exec();
              if (existingEmailUser) {
                req.flash('errors', { msg: 'There is already an account using this email address. Sign in to that account and link it with Facebook manually from Account Settings.' });
                return done(null);
              }
              var user = new User();
              user.email = profile._json.email;
              user.facebook = profile.id;
              user.tokens.push({ kind: 'facebook', accessToken: accessToken });
              user.profile.name = profile.displayName;
              user.profile.gender = profile._json.gender;
              user.profile.picture = 'https://graph.facebook.com/' + profile.id + '/picture?type=large';
              user.profile.location = (profile._json.location) ? profile._json.location.name : '';
              await user.save();
              done(null, user);
            }
          } catch(err) {
            done(err);
          }
        }));

        ***/
      });

      var githubStrategy = M(function() {
        /*** 
        // Sign in with GitHub.

        passport.use(new GitHubStrategy(secrets.github, async function(req, accessToken, refreshToken, profile, done) {
          try {
            if (req.user) {
              const existingUser = await User.findOne({ $or: [{ github: profile.id }, { email: profile.email }] }).exec();
              if (existingUser) {
                req.flash('errors', { msg: 'There is already a GitHub account that belongs to you. Sign in with that account or delete it, then link it with your current account.' });
                return done(null);
              }
              const user = await User.findById(req.user.id).exec();
              user.github = profile.id;
              user.tokens.push({ kind: 'github', accessToken: accessToken });
              user.profile.name = user.profile.name || profile.displayName;
              user.profile.picture = user.profile.picture || profile._json.avatar_url;
              user.profile.location = user.profile.location || profile._json.location;
              user.profile.website = user.profile.website || profile._json.blog;
              await user.save();
              req.flash('info', { msg: 'GitHub account has been linked.' });
              done(null, user);
            } else {
              const existingUser = await User.findOne({ github: profile.id }).exec();
              if (existingUser) return done(null, existingUser);
              const existingEmailUser = await User.findOne({ email: profile._json.email }).exec();
              if (existingEmailUser) {
                req.flash('errors', { msg: 'There is already an account using this email address. Sign in to that account and link it with GitHub manually from Account Settings.' });
                return done(null);
              }
              var user = new User();
              user.email = profile._json.email;
              user.github = profile.id;
              user.tokens.push({ kind: 'github', accessToken: accessToken });
              user.profile.name = profile.displayName;
              user.profile.picture = profile._json.avatar_url;
              user.profile.location = profile._json.location;
              user.profile.website = profile._json.blog;
              await user.save();
              done(null, user);
            }
          } catch(err) {
            done(err);
          }
        }));

        ***/
      });

      var googleStrategy = M(function() {
        /*** 
        // Sign in with Google.

        passport.use(new GoogleStrategy(secrets.google, async function(req, accessToken, refreshToken, profile, done) {
          try {
            if (req.user) {
              const existingUser = await User.findOne({ $or: [{ google: profile.id }, { email: profile.email }] }).exec();
              if (existingUser) {
                req.flash('errors', { msg: 'There is already a Google account that belongs to you. Sign in with that account or delete it, then link it with your current account.' });
                return done(null);
              }
              const user = await User.findById(req.user.id).exec();
              user.google = profile.id;
              user.tokens.push({ kind: 'google', accessToken: accessToken });
              user.profile.name = user.profile.name || profile.displayName;
              user.profile.gender = user.profile.gender || profile._json.gender;
              user.profile.picture = user.profile.picture || profile._json.picture;
              await user.save();
              req.flash('info', { msg: 'Google account has been linked.' });
              done(null, user);
            } else {
              const existingUser = await User.findOne({ google: profile.id }).exec();
              if (existingUser) return done(null, existingUser);
              const existingEmailUser = await User.findOne({ email: profile._json.email }).exec();
              if (existingEmailUser) {
                req.flash('errors', { msg: 'There is already an account using this email address. Sign in to that account and link it with Google manually from Account Settings.' });
                return done(null);
              }
              var user = new User();
              user.email = profile._json.email;
              user.google = profile.id;
              user.tokens.push({ kind: 'google', accessToken: accessToken });
              user.profile.name = profile.displayName;
              user.profile.gender = profile._json.gender;
              user.profile.picture = profile._json.picture;
              await user.save();
              done(null, user);
            }
          } catch(err) {
            done(err);
          }
         }));

         ***/
      });

      var twitterStrategy = M(function() {
        /*** 
        // Sign in with Twitter.

        passport.use(new TwitterStrategy(secrets.twitter, async function(req, accessToken, tokenSecret, profile, done) {
          try {
            if (req.user) {
              const existingUser = await User.findOne({ twitter: profile.id }).exec();
              if (existingUser) {
                req.flash('errors', { msg: 'There is already a Twitter account that belongs to you. Sign in with that account or delete it, then link it with your current account.' });
                return done(null);
              }
              const user = await User.findById(req.user.id).exec();
              user.twitter = profile.id;
              user.tokens.push({ kind: 'twitter', accessToken: accessToken, tokenSecret: tokenSecret });
              user.profile.name = user.profile.name || profile.displayName;
              user.profile.location = user.profile.location || profile._json.location;
              user.profile.picture = user.profile.picture || profile._json.profile_image_url;
              await user.save();
              req.flash('info', { msg: 'Twitter account has been linked.' });
              done(null, user);
            } else {
              const existingUser = await User.findOne({ twitter: profile.id }).exec();
              if (existingUser) return done(null, existingUser);
              var user = new User();
              // Twitter will not provide an email address.  Period.
              // But a person’s twitter username is guaranteed to be unique
              // so we can "fake" a twitter email address as follows:
              user.email = profile.username + "@twitter.com";
              user.twitter = profile.id;
              user.tokens.push({ kind: 'twitter', accessToken: accessToken, tokenSecret: tokenSecret });
              user.profile.name = profile.displayName;
              user.profile.location = profile._json.location;
              user.profile.picture = profile._json.profile_image_url;
              await user.save();
              done(null, user);
            }
          } catch(err) {
            done(err);
          }
        }));
        ***/
      });

      var linkedinStrategy = M(function() {
        /*** 
        // Sign in with LinkedIn.

        passport.use(new LinkedInStrategy(secrets.linkedin, async function(req, accessToken, refreshToken, profile, done) {
          try {
            if (req.user) {
              const existingUser = await User.findOne({ $or: [{ linkedin: profile.id }, { email: profile._json.emailAddress }] }).exec();
              if (existingUser) {
                req.flash('errors', { msg: 'There is already a LinkedIn account that belongs to you. Sign in with that account or delete it, then link it with your current account.' });
                return done(null);
              }
              const user = await User.findById(req.user.id).exec();
              user.linkedin = profile.id;
              user.tokens.push({ kind: 'linkedin', accessToken: accessToken });
              user.profile.name = user.profile.name || profile.displayName;
              user.profile.location = user.profile.location || profile._json.location.name;
              user.profile.picture = user.profile.picture || profile._json.pictureUrl;
              user.profile.website = user.profile.website || profile._json.publicProfileUrl;
              await user.save();
              req.flash('info', { msg: 'LinkedIn account has been linked.' });
              done(null, user);
            } else {
              const existingUser = await User.findOne({ linkedin: profile.id }).exec();
              if (existingUser) return done(null, existingUser);
              const existingEmailUser = await User.findOne({ email: profile._json.emailAddress }).exec();
              if (existingEmailUser) {
                req.flash('errors', { msg: 'There is already an account using this email address. Sign in to that account and link it with LinkedIn manually from Account Settings.' });
                return done(null);
              }
              var user = new User();
              user.linkedin = profile.id;
              user.tokens.push({ kind: 'linkedin', accessToken: accessToken });
              user.email = profile._json.emailAddress;
              user.profile.name = profile.displayName;
              user.profile.location = profile._json.location.name;
              user.profile.picture = profile._json.pictureUrl;
              user.profile.website = profile._json.publicProfileUrl;
              await user.save();
              done(null, user);
            }
          } catch(err) {
            done(err);
          }
        }));
        ***/
      });

      var instagramStrategy = M(function() {
        /*** 
        // Sign in with Instagram.

        passport.use(new InstagramStrategy(secrets.instagram, async function(req, accessToken, refreshToken, profile, done) {
          try {
            if (req.user) {
              const existingUser = await User.findOne({ $or: [{ instagram: profile.id }, { email: profile.email }] }).exec();
              if (existingUser) {
                req.flash('errors', { msg: 'There is already an Instagram account that belongs to you. Sign in with that account or delete it, then link it with your current account.' });
                return done(null);
              }
              const user = await User.findById(req.user.id).exec();
              user.instagram = profile.id;
              user.tokens.push({ kind: 'instagram', accessToken: accessToken });
              user.profile.name = user.profile.name || profile.displayName;
              user.profile.picture = user.profile.picture || profile._json.data.profile_picture;
              user.profile.website = user.profile.website || profile._json.data.website;
              await user.save();
              req.flash('info', { msg: 'Instagram account has been linked.' });
              done(null, user);
            } else {
              const existingUser = await User.findOne({ instagram: profile.id }).exec();
              if (existingUser) return done(null, existingUser);

              var user = new User();
              user.instagram = profile.id;
              user.tokens.push({ kind: 'instagram', accessToken: accessToken });
              user.profile.name = profile.displayName;
              user.email = '';
              user.profile.website = profile._json.data.website;
              user.profile.picture = profile._json.data.profile_picture;
              await user.save();
              done(null, user);
            }
          } catch(err) {
            done(err);
          }
        }));

        ***/
      });
      
    });
  }
});
