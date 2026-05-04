import { gcm } from "@noble/ciphers/aes.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "./randomBytes";
import { base64ToBytes, bytesToBase64 } from "./encoding";

const HKDF_INFO = new TextEncoder().encode("e2e-keyshare-v1");

export type DeviceKeyPair = {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
};

export function generateDeviceKeyPair(): DeviceKeyPair {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function publicKeyFromPrivate(privateKey: Uint8Array): Uint8Array {
  return x25519.getPublicKey(privateKey);
}

export type WrappedKey = {
  ephemeralPublicKey: string;
  iv: string;
  ciphertext: string;
};

export function wrapKeyForDevice(
  targetPublicKeyB64: string,
  conversationKey: Uint8Array,
): WrappedKey {
  const targetPub = base64ToBytes(targetPublicKeyB64);
  const ephemeralPriv = x25519.utils.randomSecretKey();
  const ephemeralPub = x25519.getPublicKey(ephemeralPriv);
  const shared = x25519.getSharedSecret(ephemeralPriv, targetPub);
  const aesKey = hkdf(sha256, shared, undefined, HKDF_INFO, 32);
  const iv = randomBytes(12);
  const ciphertext = gcm(aesKey, iv).encrypt(conversationKey);
  return {
    ephemeralPublicKey: bytesToBase64(ephemeralPub),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  };
}

export function unwrapKeyFromShare(
  privateKey: Uint8Array,
  share: WrappedKey,
): Uint8Array {
  const ephemeralPub = base64ToBytes(share.ephemeralPublicKey);
  const shared = x25519.getSharedSecret(privateKey, ephemeralPub);
  const aesKey = hkdf(sha256, shared, undefined, HKDF_INFO, 32);
  const iv = base64ToBytes(share.iv);
  const ciphertext = base64ToBytes(share.ciphertext);
  return gcm(aesKey, iv).decrypt(ciphertext);
}
