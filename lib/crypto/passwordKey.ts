import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { gcm } from "@noble/ciphers/aes.js";
import { Platform } from "react-native";
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
const TICK_MS = 16;
const VERIFIER_PLAINTEXT = "e2e-pwd-verifier-v1";

export interface PasswordVerifier {
  ciphertext: string;
  iv: string;
}

export type DeriveProgress = (percent: number) => void;

export function generatePasswordSalt(): string {
  return bytesToBase64(randomBytes(SALT_BYTES));
}

export async function deriveKeyFromPassword(
  password: string,
  saltBase64: string,
  onProgress?: DeriveProgress,
): Promise<Uint8Array> {
  if (!password) throw new Error("Empty password");
  if (Platform.OS === "web") {
    return deriveKeyFromPasswordJs(password, saltBase64, onProgress);
  }
  return deriveKeyFromPasswordNative(password, saltBase64, onProgress);
}

async function deriveKeyFromPasswordNative(
  password: string,
  saltBase64: string,
  onProgress?: DeriveProgress,
): Promise<Uint8Array> {
  const QuickCrypto = require("react-native-quick-crypto").default as {
    pbkdf2: (
      password: string,
      salt: Uint8Array,
      iterations: number,
      keylen: number,
      digest: string,
      callback: (err: Error | null, derivedKey?: Uint8Array) => void,
    ) => void;
  };
  const salt = base64ToBytes(saltBase64);
  onProgress?.(0);
  const derived = await new Promise<Uint8Array>((resolve, reject) => {
    QuickCrypto.pbkdf2(
      password,
      salt,
      PBKDF2_ITERATIONS,
      KEK_BYTES,
      "sha256",
      (err, derivedKey) => {
        if (err || !derivedKey) {
          reject(err ?? new Error("pbkdf2 failed"));
          return;
        }
        resolve(new Uint8Array(derivedKey));
      },
    );
  });
  onProgress?.(1);
  return derived;
}

function macroTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function deriveKeyFromPasswordJs(
  password: string,
  saltBase64: string,
  onProgress?: DeriveProgress,
): Promise<Uint8Array> {
  const salt = base64ToBytes(saltBase64);
  const passwordBytes = utf8Encode(password);

  const block = new Uint8Array(salt.length + 4);
  block.set(salt);
  block[salt.length + 3] = 1;

  let u = hmac(sha256, passwordBytes, block);
  const result = new Uint8Array(u);

  onProgress?.(0);
  let lastTick = Date.now();
  for (let i = 1; i < PBKDF2_ITERATIONS; i++) {
    u = hmac(sha256, passwordBytes, u);
    for (let j = 0; j < KEK_BYTES; j++) result[j] ^= u[j];
    if (Date.now() - lastTick >= TICK_MS) {
      onProgress?.(i / PBKDF2_ITERATIONS);
      await macroTick();
      lastTick = Date.now();
    }
  }
  onProgress?.(1);

  return result;
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
