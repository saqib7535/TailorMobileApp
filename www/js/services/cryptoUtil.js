/* ============================================================
   Password hashing helpers built on the Web Crypto API
   (available in modern Android WebViews and browsers alike —
   no external crypto library needed, works fully offline).
   Format stored in DB: pbkdf2$<iterations>$<saltHex>$<hashHex>
   ============================================================ */

const CryptoUtil = (function () {
  const ITERATIONS = 120000;

  function bufToHex(buf) {
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function hexToBuf(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes.buffer;
  }

  function randomSaltHex() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return bufToHex(arr);
  }

  async function deriveHash(password, saltHex, iterations) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: hexToBuf(saltHex), iterations, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    return bufToHex(bits);
  }

  async function hashPassword(password) {
    const salt = randomSaltHex();
    const hash = await deriveHash(password, salt, ITERATIONS);
    return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
  }

  async function verifyPassword(password, stored) {
    if (!stored) return false;
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const expected = parts[3];
    const actual = await deriveHash(password, salt, iterations);
    return actual === expected;
  }

  return { hashPassword, verifyPassword };
})();
