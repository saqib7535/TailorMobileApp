/* ============================================================
   keygen.js — DEV-ONLY product-key generator for Tailor Shop POS.

   This file lives in the project ROOT (outside www/), so Capacitor
   never bundles it into the APK — only you, on your own machine,
   should ever run this. Keep it that way.

   The SECRET below MUST exactly match SECRET_B64 (base64-decoded)
   in www/js/services/licenseService.js, or generated keys won't
   validate inside the app.

   Usage:
     node keygen.js trial              -> one 7-day key
     node keygen.js month 5            -> five 30-day keys
     node keygen.js lifetime 1 "Ali's Tailors"   -> one lifetime key, tagged with a note

   Every generated key is appended to product-keys.txt (also in the
   project root, also never shipped) so you have your own record of
   every key you've ever issued.
   ============================================================ */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SECRET = 'TailorShopPOS-Soothmedia-License-Secret-2026-v1';
const LOG_FILE = path.join(__dirname, 'product-keys.txt');

const DURATIONS = {
  trial: { code: 'T', label: 'Trial - 7 Days' },
  month: { code: 'M', label: 'Monthly - 30 Days' },
  lifetime: { code: 'L', label: 'Lifetime' }
};

const PAYLOAD_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O or 1/I

function randomPayload(len) {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += PAYLOAD_ALPHABET[crypto.randomInt(0, PAYLOAD_ALPHABET.length)];
  }
  return out;
}

function sign(durationCode, payload) {
  return crypto.createHmac('sha256', SECRET).update(durationCode + payload).digest('hex').slice(0, 8).toUpperCase();
}

function generateKey(durationName) {
  const cfg = DURATIONS[durationName];
  const payload = randomPayload(6);
  const sig = sign(cfg.code, payload);
  return `TS-${cfg.code}${payload}-${sig}`;
}

function ensureLogFile() {
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(
      LOG_FILE,
      '# Tailor Shop POS — issued product keys (dev-only record, never ship this file)\n' +
      '# format: <timestamp>\t<duration>\t<key>\t<note>\n\n'
    );
  }
}

function appendToLog(durationLabel, key, note) {
  ensureLogFile();
  const line = `${new Date().toISOString()}\t${durationLabel}\t${key}\t${note || ''}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

function main() {
  const [, , durationArg, countArg, ...noteParts] = process.argv;
  const durationName = (durationArg || '').toLowerCase();

  if (!DURATIONS[durationName]) {
    console.log('Usage: node keygen.js <trial|month|lifetime> [count] ["note"]');
    process.exit(1);
  }

  const count = Math.max(1, parseInt(countArg, 10) || 1);
  const note = noteParts.join(' ');
  const cfg = DURATIONS[durationName];

  console.log(`\nGenerating ${count} ${cfg.label} key(s):\n`);
  for (let i = 0; i < count; i++) {
    const key = generateKey(durationName);
    console.log('  ' + key);
    appendToLog(cfg.label, key, note);
  }
  console.log(`\nLogged to ${LOG_FILE}\n`);
}

main();
