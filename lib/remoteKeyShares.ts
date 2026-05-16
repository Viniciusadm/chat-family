import * as cryptoApi from "@/src/api/crypto";
import type { WrappedKey } from "./crypto/asymmetric";
import type { KeyShareDoc } from "@/types/chat";

export async function writeKeyShare(
  deviceId: string,
  chatId: string,
  _wrappedBy: string,
  share: WrappedKey,
): Promise<void> {
  await cryptoApi.putKeyShare(deviceId, chatId, {
    ephemeral_public_key: share.ephemeralPublicKey,
    iv: share.iv,
    ciphertext: share.ciphertext,
  });
}

export async function listKeyShares(
  deviceId: string,
): Promise<{ chatId: string; share: KeyShareDoc }[]> {
  const shares = await cryptoApi.listKeyShares(deviceId);
  return shares.map((share) => ({
    chatId: share.chat_id,
    share: {
      ephemeralPublicKey: share.ephemeral_public_key,
      iv: share.iv,
      ciphertext: share.ciphertext,
      wrappedBy: "",
      createdAt: new Date().toISOString(),
    },
  }));
}
