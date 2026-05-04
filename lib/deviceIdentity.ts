import { generateDeviceKeyPair, publicKeyFromPrivate } from "./crypto/asymmetric";
import { bytesToBase64 } from "./crypto/encoding";
import { SecureKeyStore } from "./secureKeyStore";

let cached: { publicKeyBase64: string; privateKey: Uint8Array } | null = null;

export async function ensureDeviceKeyPair(): Promise<{ publicKeyBase64: string }> {
  if (cached) return { publicKeyBase64: cached.publicKeyBase64 };
  let priv = await SecureKeyStore.getDevicePrivateKey();
  if (!priv) {
    const pair = generateDeviceKeyPair();
    await SecureKeyStore.setDevicePrivateKey(pair.privateKey);
    priv = pair.privateKey;
  }
  const pub = publicKeyFromPrivate(priv);
  cached = { publicKeyBase64: bytesToBase64(pub), privateKey: priv };
  return { publicKeyBase64: cached.publicKeyBase64 };
}

export async function getDevicePrivateKey(): Promise<Uint8Array | null> {
  if (cached) return cached.privateKey;
  const priv = await SecureKeyStore.getDevicePrivateKey();
  if (!priv) return null;
  const pub = publicKeyFromPrivate(priv);
  cached = { publicKeyBase64: bytesToBase64(pub), privateKey: priv };
  return priv;
}
