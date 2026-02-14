import JSEncrypt from 'jsencrypt'

import { useAxios } from '@/composables/use-axios'

let cachedPublicKeyPem: string | null = null
let cachedCryptoKey: CryptoKey | null = null

/**
 * Check if Web Crypto API is available (requires HTTPS or localhost)
 */
function isWebCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined'
    && typeof crypto.subtle !== 'undefined'
    && typeof crypto.subtle.importKey === 'function'
}

/**
 * Fetch RSA public key from server and cache it
 */
export async function fetchPublicKey(): Promise<string> {
  if (cachedPublicKeyPem) {
    return cachedPublicKeyPem
  }

  const { axiosInstance } = useAxios()
  try {
    const response = await axiosInstance.get('/public-key')
    if (!response.data.ok) {
      throw new Error(response.data.message || '获取公钥失败')
    }

    cachedPublicKeyPem = response.data.publicKey
    return cachedPublicKeyPem!
  }
  catch (error: any) {
    console.error('获取公钥失败:', error)
    throw new Error(error.response?.data?.message || error.message || '获取公钥失败')
  }
}

/**
 * Convert PEM public key to CryptoKey (Web Crypto API)
 */
async function importPublicKey(pem: string): Promise<CryptoKey> {
  if (cachedCryptoKey) {
    return cachedCryptoKey
  }

  // Remove PEM header/footer and newlines
  const pemContents = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '')

  // Decode base64 to binary
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

  cachedCryptoKey = await crypto.subtle.importKey(
    'spki',
    binaryDer.buffer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    false,
    ['encrypt'],
  )

  return cachedCryptoKey
}

/**
 * Encrypt using Web Crypto API (HTTPS/localhost only)
 */
async function encryptWithWebCrypto(password: string, publicKeyPem: string): Promise<string> {
  const publicKey = await importPublicKey(publicKeyPem)

  const encoder = new TextEncoder()
  const data = encoder.encode(password)

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    publicKey,
    data,
  )

  // Convert to base64
  const bytes = new Uint8Array(encrypted)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Encrypt using JSEncrypt (fallback for HTTP)
 */
function encryptWithJSEncrypt(password: string, publicKeyPem: string): string {
  const encrypt = new JSEncrypt()
  encrypt.setPublicKey(publicKeyPem)

  const encrypted = encrypt.encrypt(password)
  if (!encrypted) {
    throw new Error('加密失败')
  }

  return encrypted
}

/**
 * Encrypt password using RSA with the server's public key
 * Uses Web Crypto API when available (HTTPS), falls back to JSEncrypt (HTTP)
 */
export async function encryptPassword(password: string): Promise<string> {
  const publicKeyPem = await fetchPublicKey()

  if (isWebCryptoAvailable()) {
    try {
      return await encryptWithWebCrypto(password, publicKeyPem)
    }
    catch (error) {
      console.warn('Web Crypto API 加密失败，使用 JSEncrypt fallback:', error)
      return encryptWithJSEncrypt(password, publicKeyPem)
    }
  }
  else {
    // HTTP environment - use JSEncrypt
    // HTTP 环境下使用 JSEncrypt（生产环境建议配置 HTTPS）
    return encryptWithJSEncrypt(password, publicKeyPem)
  }
}

/**
 * Clear cached public key (useful for key rotation)
 */
export function clearPublicKeyCache(): void {
  cachedPublicKeyPem = null
  cachedCryptoKey = null
}
