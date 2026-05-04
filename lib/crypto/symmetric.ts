import { gcm } from "@noble/ciphers/aes.js";
import { randomBytes } from "./randomBytes";
import {
  base64ToBytes,
  bytesToBase64,
  utf8Decode,
  utf8Encode,
} from "./encoding";

const KEY_BYTES = 32;
const IV_BYTES = 12;

export function generateConversationKey(): Uint8Array {
  return randomBytes(KEY_BYTES);
}

export function encryptText(
  key: Uint8Array,
  plaintext: string,
): { ciphertext: string; iv: string } {
  const iv = randomBytes(IV_BYTES);
  const cipher = gcm(key, iv).encrypt(utf8Encode(plaintext));
  return { ciphertext: bytesToBase64(cipher), iv: bytesToBase64(iv) };
}

export function decryptText(
  key: Uint8Array,
  ciphertextB64: string,
  ivB64: string,
): string {
  const cipher = base64ToBytes(ciphertextB64);
  const iv = base64ToBytes(ivB64);
  return utf8Decode(gcm(key, iv).decrypt(cipher));
}
