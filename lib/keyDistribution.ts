import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { unwrapKeyFromShare, wrapKeyForDevice } from "./crypto/asymmetric";
import { getConversationKey, importConversationKey } from "./conversationKeys";
import { getDevicePrivateKey } from "./deviceIdentity";
import { listKeyShares, writeKeyShare } from "./firestoreKeyShares";
import type { DeviceDoc } from "@/types/chat";

async function findApprovedDevicesForMember(
  memberId: string,
  tenantId: string,
): Promise<{ deviceId: string; publicKey: string }[]> {
  const userSnap = await getDocs(
    query(collection(db, "users"), where("memberId", "==", memberId)),
  );
  const targets: { deviceId: string; publicKey: string }[] = [];
  for (const u of userSnap.docs) {
    const devSnap = await getDocs(
      query(
        collection(db, "devices"),
        where("userId", "==", u.id),
        where("tenantId", "==", tenantId),
        where("approved", "==", true),
      ),
    );
    for (const d of devSnap.docs) {
      const data = d.data() as DeviceDoc;
      if (typeof data.publicKey === "string" && data.publicKey.length > 0) {
        targets.push({ deviceId: d.id, publicKey: data.publicKey });
      }
    }
  }
  return targets;
}

export async function distributeConversationKey(
  chatId: string,
  participantMemberIds: string[],
  tenantId: string,
  wrappedBy: string,
): Promise<void> {
  const key = await getConversationKey(chatId);
  if (!key) return;

  const targets: { deviceId: string; publicKey: string }[] = [];
  for (const memberId of participantMemberIds) {
    targets.push(...(await findApprovedDevicesForMember(memberId, tenantId)));
  }

  for (const target of targets) {
    const wrapped = wrapKeyForDevice(target.publicKey, key);
    try {
      await writeKeyShare(target.deviceId, chatId, wrappedBy, wrapped);
    } catch {
      // Permission or transient failure; skip silently.
    }
  }
}

export async function distributeAllOwnedKeysToDevice(
  targetDeviceId: string,
  targetPublicKey: string,
  chatIds: string[],
  wrappedBy: string,
): Promise<void> {
  for (const chatId of chatIds) {
    const key = await getConversationKey(chatId);
    if (!key) continue;
    const wrapped = wrapKeyForDevice(targetPublicKey, key);
    try {
      await writeKeyShare(targetDeviceId, chatId, wrappedBy, wrapped);
    } catch {
      // Skip; the next approval pass can retry.
    }
  }
}

export async function consumePendingKeyShares(deviceId: string): Promise<string[]> {
  if (!deviceId) return [];
  const priv = await getDevicePrivateKey();
  if (!priv) return [];
  const shares = await listKeyShares(deviceId);
  const importedChatIds: string[] = [];
  for (const { chatId, share } of shares) {
    try {
      const key = unwrapKeyFromShare(priv, share);
      await importConversationKey(chatId, key);
      importedChatIds.push(chatId);
    } catch {
      // Bad share; skip.
    }
  }
  return importedChatIds;
}
