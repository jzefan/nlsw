const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEYS_DIR = path.join(__dirname, '..', 'keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public.pem');

let privateKey = null;
let publicKey = null;

/**
 * Generate RSA key pair and save to files
 */
function generateKeyPair() {
  const { publicKey: pubKey, privateKey: privKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  // Ensure keys directory exists
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
  }

  fs.writeFileSync(PRIVATE_KEY_PATH, privKey, { mode: 0o600 });
  fs.writeFileSync(PUBLIC_KEY_PATH, pubKey, { mode: 0o644 });

  console.log('RSA key pair generated and saved to keys/ directory');
  return { publicKey: pubKey, privateKey: privKey };
}

/**
 * Load keys from files or generate if not exist
 */
function loadKeys() {
  if (privateKey && publicKey) {
    return { publicKey, privateKey };
  }

  if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
    privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
    publicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
    console.log('RSA keys loaded from keys/ directory');
  } else {
    const keys = generateKeyPair();
    privateKey = keys.privateKey;
    publicKey = keys.publicKey;
  }

  return { publicKey, privateKey };
}

/**
 * Get public key (PEM format)
 */
function getPublicKey() {
  loadKeys();
  return publicKey;
}

/**
 * Decrypt password using RSA
 * Supports both RSA-OAEP (Web Crypto API) and PKCS#1 v1.5 (JSEncrypt)
 * @param {string} encryptedPassword - Base64 encoded encrypted password
 * @returns {string} - Decrypted password
 */
function decryptPassword(encryptedPassword) {
  loadKeys();

  const buffer = Buffer.from(encryptedPassword, 'base64');

  // Try RSA-OAEP first (Web Crypto API - HTTPS environment)
  try {
    const decrypted = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      buffer
    );
    return decrypted.toString('utf8');
  } catch (oaepError) {
    // Try PKCS#1 v1.5 (JSEncrypt - HTTP fallback)
    try {
      const decrypted = crypto.privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_PADDING
        },
        buffer
      );
      return decrypted.toString('utf8');
    } catch (pkcs1Error) {
      console.error('Password decryption failed (both OAEP and PKCS1):', oaepError.message, pkcs1Error.message);
      throw new Error('密码解密失败');
    }
  }
}

/**
 * Check if password appears to be encrypted (Base64 encoded)
 * @param {string} password - Password string to check
 * @returns {boolean}
 */
function isEncryptedPassword(password) {
  // RSA 2048-bit encrypted data is 256 bytes, which is ~342 chars in Base64
  // Plain passwords are typically much shorter
  if (!password || password.length < 100) {
    return false;
  }

  // Check if it's valid Base64
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  return base64Regex.test(password);
}

// Initialize keys on module load
loadKeys();

module.exports = {
  getPublicKey,
  decryptPassword,
  isEncryptedPassword
};
