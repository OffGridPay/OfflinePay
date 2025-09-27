/**
 * Cryptographic Handshake Utilities for BLE Relayer
 * Implements ECDH key exchange and session key derivation
 */

import { ethers } from 'ethers';
import CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';

/**
 * Generate ECDH key pair using wallet's private key as seed
 */
export async function generateECDHKeyPair(walletPrivateKey) {
  // Use wallet private key to seed deterministic key generation
  const seedHash = CryptoJS.SHA256(walletPrivateKey).toString();
  const ephemeralWallet = new ethers.Wallet(seedHash);
  
  return {
    privateKey: ephemeralWallet.privateKey,
    publicKey: ephemeralWallet.publicKey,
    address: ephemeralWallet.address,
  };
}

/**
 * Derive shared secret from ECDH key exchange
 */
export function deriveSharedSecret(myPrivateKey, peerPublicKey) {
  try {
    // Use ethers.js signing key for ECDH
    const signingKey = new ethers.utils.SigningKey(myPrivateKey);
    const sharedPoint = signingKey.computeSharedSecret(peerPublicKey);
    
    // Hash the shared point to get a consistent shared secret
    return CryptoJS.SHA256(sharedPoint).toString();
  } catch (error) {
    throw new Error(`ECDH key derivation failed: ${error.message}`);
  }
}

/**
 * Derive session keys from shared secret using HKDF
 */
export function deriveSessionKeys(sharedSecret, sessionId, peerInfo = {}) {
  const info = JSON.stringify({
    sessionId,
    timestamp: Date.now(),
    ...peerInfo,
  });
  
  // Simple HKDF implementation using HMAC-SHA256
  const prk = CryptoJS.HmacSHA256(sharedSecret, 'OfflinePayBLE');
  const okm = CryptoJS.HmacSHA256(info, prk);
  
  // Derive multiple keys from the output key material
  const encKey = okm.toString().slice(0, 32); // 128-bit AES key
  const macKey = okm.toString().slice(32, 64); // MAC key
  const nonce = okm.toString().slice(64, 80); // 64-bit nonce
  
  return {
    encryptionKey: encKey,
    macKey: macKey,
    baseNonce: nonce,
  };
}

/**
 * Encrypt payload using session key
 */
export function encryptPayload(data, sessionKeys, sequence = 0) {
  try {
    // Create unique nonce for this message
    const nonce = CryptoJS.SHA256(sessionKeys.baseNonce + sequence.toString()).toString().slice(0, 16);
    
    // Encrypt using AES-GCM (simulated with AES + HMAC)
    const ciphertext = CryptoJS.AES.encrypt(data, sessionKeys.encryptionKey, {
      iv: CryptoJS.enc.Hex.parse(nonce),
    }).toString();
    
    // Calculate MAC
    const mac = CryptoJS.HmacSHA256(ciphertext + nonce, sessionKeys.macKey).toString().slice(0, 16);
    
    return {
      ciphertext,
      nonce,
      mac,
      encrypted: ciphertext + '|' + nonce + '|' + mac,
    };
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt payload using session key
 */
export function decryptPayload(encryptedData, sessionKeys) {
  try {
    const parts = encryptedData.split('|');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted payload format');
    }
    
    const [ciphertext, nonce, expectedMac] = parts;
    
    // Verify MAC
    const actualMac = CryptoJS.HmacSHA256(ciphertext + nonce, sessionKeys.macKey).toString().slice(0, 16);
    if (actualMac !== expectedMac) {
      throw new Error('MAC verification failed - payload may be tampered');
    }
    
    // Decrypt
    const decrypted = CryptoJS.AES.decrypt(ciphertext, sessionKeys.encryptionKey, {
      iv: CryptoJS.enc.Hex.parse(nonce),
    });
    
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Create handshake initiation message
 */
export async function createHandshakeInit(walletPrivateKey, deviceRole, challengeNonce = null) {
  const keyPair = await generateECDHKeyPair(walletPrivateKey);
  const challenge = challengeNonce || await Crypto.getRandomBytesAsync(16);
  
  const message = {
    type: 'HANDSHAKE_INIT',
    timestamp: Date.now(),
    publicKey: keyPair.publicKey,
    deviceRole,
    challenge: Buffer.from(challenge).toString('hex'),
    signature: null,
  };
  
  // Sign the message with wallet key for authentication
  const wallet = new ethers.Wallet(walletPrivateKey);
  const messageHash = CryptoJS.SHA256(JSON.stringify({
    publicKey: message.publicKey,
    deviceRole: message.deviceRole,
    challenge: message.challenge,
  })).toString();
  
  message.signature = await wallet.signMessage(messageHash);
  
  return {
    message,
    ephemeralPrivateKey: keyPair.privateKey,
  };
}

/**
 * Process handshake initiation and create response
 */
export async function processHandshakeInit(initMessage, myWalletPrivateKey, myDeviceRole) {
  try {
    // Verify the signature
    const messageHash = CryptoJS.SHA256(JSON.stringify({
      publicKey: initMessage.publicKey,
      deviceRole: initMessage.deviceRole,
      challenge: initMessage.challenge,
    })).toString();
    
    const recoveredAddress = ethers.utils.verifyMessage(messageHash, initMessage.signature);
    
    // Generate my ephemeral key pair
    const myKeyPair = await generateECDHKeyPair(myWalletPrivateKey);
    
    // Derive shared secret
    const sharedSecret = deriveSharedSecret(myKeyPair.privateKey, initMessage.publicKey);
    
    // Create response message
    const responseChallenge = await Crypto.getRandomBytesAsync(16);
    const response = {
      type: 'HANDSHAKE_RESPONSE',
      timestamp: Date.now(),
      publicKey: myKeyPair.publicKey,
      deviceRole: myDeviceRole,
      originalChallenge: initMessage.challenge,
      responseChallenge: Buffer.from(responseChallenge).toString('hex'),
      signature: null,
    };
    
    // Sign the response
    const wallet = new ethers.Wallet(myWalletPrivateKey);
    const responseHash = CryptoJS.SHA256(JSON.stringify({
      publicKey: response.publicKey,
      deviceRole: response.deviceRole,
      originalChallenge: response.originalChallenge,
      responseChallenge: response.responseChallenge,
    })).toString();
    
    response.signature = await wallet.signMessage(responseHash);
    
    return {
      response,
      sharedSecret,
      peerAddress: recoveredAddress,
      ephemeralPrivateKey: myKeyPair.privateKey,
    };
  } catch (error) {
    throw new Error(`Handshake processing failed: ${error.message}`);
  }
}

/**
 * Complete handshake from initiator side
 */
export function completeHandshake(responseMessage, myEphemeralPrivateKey, originalChallenge) {
  try {
    // Verify response challenge matches
    if (responseMessage.originalChallenge !== originalChallenge) {
      throw new Error('Challenge mismatch in handshake response');
    }
    
    // Verify signature
    const responseHash = CryptoJS.SHA256(JSON.stringify({
      publicKey: responseMessage.publicKey,
      deviceRole: responseMessage.deviceRole,
      originalChallenge: responseMessage.originalChallenge,
      responseChallenge: responseMessage.responseChallenge,
    })).toString();
    
    const peerAddress = ethers.utils.verifyMessage(responseHash, responseMessage.signature);
    
    // Derive shared secret
    const sharedSecret = deriveSharedSecret(myEphemeralPrivateKey, responseMessage.publicKey);
    
    return {
      sharedSecret,
      peerAddress,
      peerRole: responseMessage.deviceRole,
    };
  } catch (error) {
    throw new Error(`Handshake completion failed: ${error.message}`);
  }
}

/**
 * Validate handshake session and derive keys
 */
export function establishSession(sharedSecret, sessionId, peerInfo) {
  const sessionKeys = deriveSessionKeys(sharedSecret, sessionId, peerInfo);
  
  return {
    sessionId,
    sessionKeys,
    createdAt: Date.now(),
    peerInfo,
  };
}

export default {
  generateECDHKeyPair,
  deriveSharedSecret,
  deriveSessionKeys,
  encryptPayload,
  decryptPayload,
  createHandshakeInit,
  processHandshakeInit,
  completeHandshake,
  establishSession,
};
