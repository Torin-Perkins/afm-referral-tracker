/**
 * AFM Referral Tracker — Google Apps Script backend.
 *
 * Paste this into Extensions > Apps Script inside the "Referral Tracker"
 * Google Sheet, set the Script Properties listed below, and deploy it as a
 * Web App (Execute as: Me, Who has access: Anyone). See README.md.
 *
 * Script Properties (Project Settings > Script Properties):
 *   TRACKER_PASSWORD  (required) password for the tracker page
 *   BOSS_EMAIL        (optional) who gets the new-referral email.
 *                     Comma-separate for several people. If unset, the email
 *                     goes to the account that owns the script (you), which
 *                     is handy while testing.
 */

const SHEET_NAME = 'Referrals';
const HEADERS = ['Submitted', 'AFM Name', 'Phone', 'Email', 'Referred By', 'Notes'];

const MAX_FAILED_LOGINS = 10;        // per window, across all visitors
const FAILED_LOGIN_WINDOW_SEC = 600; // 10 minutes

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Bad request.' });
  }

  try {
    if (body.action === 'submit') return json_(handleSubmit_(body));
    if (body.action === 'list') return json_(handleList_(body));
    return json_({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'Something went wrong on the server. Please try again.' });
  }
}

// A GET just confirms the deployment is alive. It never returns data.
function doGet() {
  return json_({ ok: true, message: 'AFM Referral Tracker backend is running.' });
}

/* ---------------------------------------------------------------- submit */

function handleSubmit_(body) {
  // Honeypot: real people never fill this hidden field; bots often do.
  if (clean_(body.website, 200)) return { ok: true };

  const name = clean_(body.name, 100);
  const phone = clean_(body.phone, 30);
  const email = clean_(body.email, 254);
  const referredBy = clean_(body.referredBy, 100);
  const notes = clean_(body.notes, 1000);

  if (!name) return { ok: false, error: 'Please enter the AFM\'s name.' };
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return { ok: false, error: 'Please enter a valid phone number.' };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'That email address doesn\'t look right.' };
  }

  const submitted = new Date();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    getSheet_().appendRow([
      submitted,
      safeCell_(name),
      safeCell_(phone),
      safeCell_(email),
      safeCell_(referredBy),
      safeCell_(notes),
    ]);
  } finally {
    lock.releaseLock();
  }

  sendNotification_({ submitted, name, phone, email, referredBy, notes });
  return { ok: true };
}

function sendNotification_(r) {
  const to = PropertiesService.getScriptProperties().getProperty('BOSS_EMAIL')
    || Session.getEffectiveUser().getEmail();
  if (!to) return;

  const when = Utilities.formatDate(r.submitted, Session.getScriptTimeZone(), 'MMM d, yyyy h:mm a');
  const lines = [
    'A new AFM referral was submitted.',
    '',
    'Name:        ' + r.name,
    'Phone:       ' + r.phone,
    'Email:       ' + (r.email || '(not provided)'),
    'Referred by: ' + (r.referredBy || '(not provided)'),
  ];
  if (r.notes) lines.push('', 'Notes:', r.notes);
  lines.push('', 'Submitted: ' + when,
    'All referrals: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl());

  const options = { name: 'AFM Referral Tracker' };
  if (r.email) options.replyTo = r.email;

  MailApp.sendEmail(to, 'New AFM referral: ' + r.name, lines.join('\n'), options);
}

/* ------------------------------------------------------------------ list */

function handleList_(body) {
  const props = PropertiesService.getScriptProperties();
  const expected = props.getProperty('TRACKER_PASSWORD');
  if (!expected) {
    return { ok: false, error: 'No tracker password is set yet. Add TRACKER_PASSWORD in Script Properties.' };
  }

  const cache = CacheService.getScriptCache();
  const failed = Number(cache.get('failedLogins') || 0);
  if (failed >= MAX_FAILED_LOGINS) {
    return { ok: false, error: 'Too many wrong passwords. Try again in a few minutes.' };
  }

  if (!safeEquals_(String(body.password || ''), expected)) {
    cache.put('failedLogins', String(failed + 1), FAILED_LOGIN_WINDOW_SEC);
    Utilities.sleep(800); // slow down guessing
    return { ok: false, error: 'Incorrect password.', unauthorized: true };
  }

  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, rows: [] };

  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const rows = values
    .filter(v => v.some(cell => cell !== ''))
    .map(v => ({
      submitted: v[0] instanceof Date ? v[0].toISOString() : String(v[0]),
      name: String(v[1]),
      phone: String(v[2]),
      email: String(v[3]),
      referredBy: String(v[4]),
      notes: String(v[5]),
    }))
    .reverse(); // newest first

  return { ok: true, rows };
}

/* --------------------------------------------------------------- helpers */

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function clean_(value, maxLen) {
  return String(value == null ? '' : value).trim().slice(0, maxLen);
}

// Stop the sheet from treating text like "=HYPERLINK(...)" or "+1 555..." as a formula.
function safeCell_(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function safeEquals_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run this once from the Apps Script editor (select it, click Run) to grant
 * permissions and create the Referrals tab with headers.
 */
function setup() {
  getSheet_();
  console.log('Sheet ready. Notification email goes to: ' +
    (PropertiesService.getScriptProperties().getProperty('BOSS_EMAIL') || Session.getEffectiveUser().getEmail()));
}
