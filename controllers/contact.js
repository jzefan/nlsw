var secrets = require('../config/secrets');
var { body, validationResult } = require('express-validator');

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
  await body('name').notEmpty().withMessage('Name cannot be blank').run(req);
  await body('email').isEmail().withMessage('Email is not valid').run(req);
  await body('message').notEmpty().withMessage('Message cannot be blank').run(req);

  var errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.flash('errors', errors.array());
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
