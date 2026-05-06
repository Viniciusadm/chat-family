import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { gcm } from "@noble/ciphers/aes.js";
import { randomBytes } from "./randomBytes";
import {
  base64ToBytes,
  bytesToBase64,
  utf8Decode,
  utf8Encode,
} from "./encoding";

const PBKDF2_ITERATIONS = 600_000;
const KEK_BYTES = 32;
const SALT_BYTES = 16;
const VERIFIER_PLAINTEXT = "e2e-pwd-verifier-v1";

export interface PasswordVerifier {
  ciphertext: string;
  iv: string;
}

export function generatePasswordSalt(): string {
  return bytesToBase64(randomBytes(SALT_BYTES));
}

export async function deriveKeyFromPassword(
  password: string,
  saltBase64: string,
): Promise<Uint8Array> {
  if (!password) throw new Error("Empty password");
  const salt = base64ToBytes(saltBase64);
  return pbkdf2Async(sha256, utf8Encode(password), salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: KEK_BYTES,
    asyncTick: 20,
  });
}

export function makePasswordVerifier(kek: Uint8Array): PasswordVerifier {
  const iv = randomBytes(12);
  const ct = gcm(kek, iv).encrypt(utf8Encode(VERIFIER_PLAINTEXT));
  return { ciphertext: bytesToBase64(ct), iv: bytesToBase64(iv) };
}

export function checkPasswordVerifier(
  kek: Uint8Array,
  verifier: PasswordVerifier,
): boolean {
  try {
    const iv = base64ToBytes(verifier.iv);
    const ct = base64ToBytes(verifier.ciphertext);
    const pt = utf8Decode(gcm(kek, iv).decrypt(ct));
    return pt === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}

export function encryptConversationKeyWithKek(
  kek: Uint8Array,
  conversationKey: Uint8Array,
): { ciphertext: string; iv: string } {
  const iv = randomBytes(12);
  const ct = gcm(kek, iv).encrypt(conversationKey);
  return { ciphertext: bytesToBase64(ct), iv: bytesToBase64(iv) };
}

export function decryptConversationKeyWithKek(
  kek: Uint8Array,
  ciphertextB64: string,
  ivB64: string,
): Uint8Array {
  const iv = base64ToBytes(ivB64);
  const ct = base64ToBytes(ciphertextB64);
  return gcm(kek, iv).decrypt(ct);
}

export const PASSWORD_MIN_LENGTH = 8;

export function validatePasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (!/[a-z]/.test(password)) return "Inclua pelo menos uma letra minúscula.";
  if (!/[A-Z]/.test(password)) return "Inclua pelo menos uma letra maiúscula.";
  if (!/[0-9]/.test(password)) return "Inclua pelo menos um número.";
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Inclua pelo menos um caractere especial (ex.: !@#$%).";
  }
  return null;
}
