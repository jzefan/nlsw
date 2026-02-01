var secrets = require('../config/secrets');
// var nodemailer = require("nodemailer"); // Removed - not used
// Email transport removed - nodemailer not in use

/**
 * GET /contact
 * Contact form page.
 */

exports.getContact = function(req, res) {
  res.render('contact', {
    title: 'Contact'
  });
};

/**
 * POST /contact
 * Send a contact form via Nodemailer.
 * @param email
 * @param name
 * @param message
 */

exports.postContact = async function(req, res) {
  req.assert('name', 'Name cannot be blank').notEmpty();
  req.assert('email', 'Email is not valid').isEmail();
  req.assert('message', 'Message cannot be blank').notEmpty();

  var errors = req.validationErrors();

  if (errors) {
    req.flash('errors', errors);
    return res.redirect('/contact');
  }

  var from = req.body.email;
  var name = req.body.name;
  var body = req.body.message;
  var to = 'your@email.com';
  var subject = 'Contact Form | Hackathon Starter';

  // Email functionality removed - nodemailer not in use
  // TODO: Implement contact form email if needed in the future
  // Contact info: from: ${from}, to: ${to}, subject: ${subject}, body: ${body}

  req.flash('info', { msg: 'Contact form submitted. Email functionality is currently disabled.' });
  res.redirect('/contact');
};
