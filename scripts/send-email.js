#!/usr/bin/env node
/**
 * send-email.js — Zazu email sender via Gmail SMTP
 *
 * Usage:
 *   node send-email.js --to "addr@example.com" --subject "Subject" --body "Body text"
 *   node send-email.js --to "a@b.com" --to "c@d.com" --subject "Hi" --html "<b>Hello</b>"
 *
 * Allowed recipients (enforced — will refuse others):
 *   nconduah@gmail.com, nconduah2@gmail.com,
 *   nanaec.nychesolutions@gmail.com, nanayaaf@gmail.com
 *
 * Reads GMAIL_APP_PASSWORD from environment or ~/.zazu-email-creds (one line: password)
 */

const nodemailer = require('/Users/zazunyche/.npm-global/node_modules/nodemailer');
const fs = require('fs');
const path = require('path');

const SENDER = 'zazunyche@gmail.com';
const ALLOWED_RECIPIENTS = new Set([
  'nconduah@gmail.com',
  'nconduah2@gmail.com',
  'nanaec.nychesolutions@gmail.com',
  'nanayaaf@gmail.com'
]);

// Parse args
const args = process.argv.slice(2);
const get = (flag) => {
  const vals = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && args[i + 1]) vals.push(args[++i]);
  }
  return vals;
};

const to = get('--to');
const cc = get('--cc');
const subject = (get('--subject')[0] || '').trim();
const body = get('--body').join('\n') || get('--text').join('\n');
const html = get('--html')[0] || '';

if (!to.length) { console.error('Error: --to is required'); process.exit(1); }
if (!subject)   { console.error('Error: --subject is required'); process.exit(1); }
if (!body && !html) { console.error('Error: --body or --html is required'); process.exit(1); }

// Enforce allowlist
const allRecipients = [...to, ...cc];
const blocked = allRecipients.filter(r => !ALLOWED_RECIPIENTS.has(r.toLowerCase()));
if (blocked.length) {
  console.error(`Error: recipient(s) not on allowlist: ${blocked.join(', ')}`);
  console.error(`Allowed: ${[...ALLOWED_RECIPIENTS].join(', ')}`);
  process.exit(1);
}

// Get password
let password = process.env.GMAIL_APP_PASSWORD;
if (!password) {
  const credsFile = path.join(process.env.HOME, '.zazu-email-creds');
  if (fs.existsSync(credsFile)) {
    password = fs.readFileSync(credsFile, 'utf8').trim();
  }
}
if (!password) {
  console.error('Error: set GMAIL_APP_PASSWORD env var or create ~/.zazu-email-creds');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: SENDER, pass: password }
});

const mailOptions = { from: SENDER, to, subject };
if (cc.length) mailOptions.cc = cc;
if (html) { mailOptions.html = html; if (body) mailOptions.text = body; }
else mailOptions.text = body;

transporter.sendMail(mailOptions, (err, info) => {
  if (err) {
    console.error('FAILED:', err.message);
    process.exit(1);
  }
  console.log('SENT:', info.messageId);
  console.log('To:', to.join(', '));
  console.log('Subject:', subject);
});
