import * as ExpoCrypto from "expo-crypto";

export function randomBytes(length: number): Uint8Array {
  return ExpoCrypto.getRandomBytes(length);
}
