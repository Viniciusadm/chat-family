import {
  FieldValue,
  getFirestore,
  type DocumentReference,
  type QuerySnapshot,
  type Timestamp,
} from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";

initializeApp();
const db = getFirestore();
const adminAuth = getAuth();
const storageBucket = getStorage().bucket();

type ChatPayload = {
  tenantId?: unknown;
  participants?: unknown;
};

function sortedParticipantKey(participants: string[]): string {
  return [...participants].sort().join("\u0001");
}

async function addChatToMemberUsers(
  chatId: string,
  tenantId: string,
  memberId: string
): Promise<void> {
  const usersSnap = await db.collection("users").where("memberId", "==", memberId).get();
  if (usersSnap.empty) return;
  let batch = db.batch();
  let n = 0;
  for (const userDoc of usersSnap.docs) {
    batch.set(userDoc.ref.collection("chatList").doc(chatId), { tenantId });
    n++;
    if (n >= 450) {
      await batch.commit();
      batch = db.batch();
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
}

async function removeChatFromMemberUsers(chatId: string, memberId: string): Promise<void> {
  const usersSnap = await db.collection("users").where("memberId", "==", memberId).get();
  if (usersSnap.empty) return;
  let batch = db.batch();
  let n = 0;
  for (const userDoc of usersSnap.docs) {
    batch.delete(userDoc.ref.collection("chatList").doc(chatId));
    n++;
    if (n >= 450) {
      await batch.commit();
      batch = db.batch();
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
}

async function clearUserChatList(uid: string): Promise<void> {
  const snap = await db.collection(`users/${uid}/chatList`).get();
  if (snap.empty) return;
  let batch = db.batch();
  let n = 0;
  for (const d of snap.docs) {
    batch.delete(d.ref);
    n++;
    if (n >= 450) {
      await batch.commit();
      batch = db.batch();
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
}

async function syncUserChatList(uid: string, tenantId: string, memberId: string): Promise<void> {
  const chatsSnap = await db
    .collection("chats")
    .where("tenantId", "==", tenantId)
    .where("participants", "array-contains", memberId)
    .get();
  let batch = db.batch();
  let n = 0;
  for (const chatDoc of chatsSnap.docs) {
    batch.set(db.doc(`users/${uid}/chatList/${chatDoc.id}`), { tenantId });
    n++;
    if (n >= 450) {
      await batch.commit();
      batch = db.batch();
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
}

export const onChatWrite = onDocumentWritten(
  { document: "chats/{chatId}", region: "southamerica-east1" },
  async (event) => {
    const chatId = event.params.chatId;
    const beforeSnap = event.data?.before;
    const afterSnap = event.data?.after;

    if (!afterSnap?.exists) {
      const before = beforeSnap?.exists ? (beforeSnap.data() as ChatPayload) : undefined;
      const oldP = Array.isArray(before?.participants)
        ? (before.participants as string[])
        : [];
      for (const memberId of oldP) {
        await removeChatFromMemberUsers(chatId, memberId);
      }
      return;
    }

    const after = afterSnap.data() as ChatPayload;
    const tenantId = typeof after.tenantId === "string" ? after.tenantId : null;
    if (!tenantId) return;
    const newP = Array.isArray(after.participants) ? (after.participants as string[]) : [];

    if (beforeSnap?.exists) {
      const before = beforeSnap.data() as ChatPayload;
      const oldP = Array.isArray(before.participants) ? (before.participants as string[]) : [];
      const tenantSame = before.tenantId === after.tenantId;
      const participantsSame = sortedParticipantKey(oldP) === sortedParticipantKey(newP);
      if (tenantSame && participantsSame) {
        return;
      }
      for (const memberId of oldP) {
        if (!newP.includes(memberId)) {
          await removeChatFromMemberUsers(chatId, memberId);
        }
      }
    }

    for (const memberId of newP) {
      await addChatToMemberUsers(chatId, tenantId, memberId);
    }
  }
);

export const onUserWrite = onDocumentWritten(
  { document: "users/{userId}", region: "southamerica-east1" },
  async (event) => {
    const uid = event.params.userId;
    const afterSnap = event.data?.after;
    if (!afterSnap?.exists) return;

    const after = afterSnap.data() as {
      tenantId?: unknown;
      memberId?: unknown;
      chatIndexBuiltAt?: unknown;
    };
    const tenantId = typeof after.tenantId === "string" ? after.tenantId : null;
    const memberId = typeof after.memberId === "string" ? after.memberId : null;
    if (!tenantId || !memberId) return;

    const beforeSnap = event.data?.before;
    const beforeExists = beforeSnap?.exists === true;
    const before = beforeExists ? (beforeSnap!.data() as typeof after) : undefined;

    const membershipChanged =
      !beforeExists ||
      before?.memberId !== memberId ||
      before?.tenantId !== tenantId;

    const indexFirstSet =
      after.chatIndexBuiltAt != null &&
      (before == null || before.chatIndexBuiltAt == null);

    if (!membershipChanged && !indexFirstSet) {
      return;
    }

    if (beforeExists && before != null) {
      const oldMemberId =
        typeof before.memberId === "string" ? before.memberId : null;
      const oldTenantId = typeof before.tenantId === "string" ? before.tenantId : null;
      if (
        oldMemberId != null &&
        oldTenantId != null &&
        (oldMemberId !== memberId || oldTenantId !== tenantId)
      ) {
        await clearUserChatList(uid);
      }
    }

    await syncUserChatList(uid, tenantId, memberId);
  }
);

type DeviceData = {
  userId?: string;
  approved?: boolean;
  tenantId?: string;
  sessionAt?: Timestamp;
};

async function deactivateOtherDevices(userId: string, keepDeviceId: string): Promise<void> {
  const snap = await db.collection("devices").where("userId", "==", userId).get();
  if (snap.empty) return;
  let batch = db.batch();
  let n = 0;
  for (const d of snap.docs) {
    const ref = d.ref;
    if (d.id === keepDeviceId) {
      batch.update(ref, { active: true });
    } else {
      batch.update(ref, { active: false });
    }
    n++;
    if (n >= 450) {
      await batch.commit();
      batch = db.batch();
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
}

async function ensureSingleActiveForApprovedUser(
  userId: string,
  deviceId: string,
  approved: boolean
): Promise<void> {
  if (!approved) return;
  await deactivateOtherDevices(userId, deviceId);
}

function sessionAtChanged(
  before: DeviceData | undefined,
  after: DeviceData | undefined
): boolean {
  const a = after?.sessionAt;
  const b = before?.sessionAt;
  if (!a) return false;
  if (!b) return true;
  return a.toMillis() !== b.toMillis();
}

export const onDeviceCreated = onDocumentCreated(
  { document: "devices/{deviceId}", region: "southamerica-east1" },
  async (event) => {
    const deviceId = event.params.deviceId;
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() as DeviceData;
    const userId = typeof data.userId === "string" ? data.userId : null;
    if (!userId) return;
    const approved = data.approved === true;
    try {
      if (approved) {
        await ensureSingleActiveForApprovedUser(userId, deviceId, true);
      } else {
        await db.doc(`devices/${deviceId}`).update({ active: true });
      }
    } catch (e) {
      logger.error("onDeviceCreated failed", e);
    }
  }
);

export const onDeviceUpdated = onDocumentUpdated(
  { document: "devices/{deviceId}", region: "southamerica-east1" },
  async (event) => {
    const deviceId = event.params.deviceId;
    const beforeSnap = event.data?.before;
    const afterSnap = event.data?.after;
    if (!afterSnap?.exists) return;
    const before = beforeSnap?.exists ? (beforeSnap.data() as DeviceData) : undefined;
    const after = afterSnap.data() as DeviceData;
    const userId = typeof after.userId === "string" ? after.userId : null;
    if (!userId) return;

    const approvedAfter = after.approved === true;
    const becameApproved = approvedAfter && before?.approved === false;

    try {
      if (becameApproved) {
        await ensureSingleActiveForApprovedUser(userId, deviceId, true);
        return;
      }
      if (approvedAfter && sessionAtChanged(before, after)) {
        await ensureSingleActiveForApprovedUser(userId, deviceId, true);
      }
    } catch (e) {
      logger.error("onDeviceUpdated failed", e);
    }
  }
);

export const approveDevice = onCall({ region: "southamerica-east1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const raw = request.data as { deviceId?: unknown };
  const deviceId = typeof raw.deviceId === "string" ? raw.deviceId : null;
  if (!deviceId) {
    throw new HttpsError("invalid-argument", "deviceId is required.");
  }

  const adultSnap = await db.doc(`users/${uid}`).get();
  if (!adultSnap.exists) {
    throw new HttpsError("permission-denied", "User not found.");
  }
  const adult = adultSnap.data() as { tenantId?: string; role?: string };
  if (adult.role !== "adult") {
    throw new HttpsError("permission-denied", "Only adults can approve devices.");
  }
  const tenantId = typeof adult.tenantId === "string" ? adult.tenantId : null;
  if (!tenantId) {
    throw new HttpsError("failed-precondition", "Missing tenant.");
  }

  const deviceRef = db.doc(`devices/${deviceId}`);
  const deviceSnap = await deviceRef.get();
  if (!deviceSnap.exists) {
    throw new HttpsError("not-found", "Device not found.");
  }
  const dev = deviceSnap.data() as { tenantId?: string };
  if (dev.tenantId !== tenantId) {
    throw new HttpsError("permission-denied", "Device belongs to another tenant.");
  }

  await deviceRef.update({ approved: true });
  return { ok: true };
});

type AdultUserData = {
  tenantId?: string;
  role?: string;
};

type MemberData = {
  tenantId?: string;
  name?: string;
  role?: string;
  loginCode?: string | null;
};

type MessageData = {
  tenantId?: string;
  senderId?: string;
  audioUrl?: string | null;
};

async function assertTenantAdult(uid: string): Promise<string> {
  const adultSnap = await db.doc(`users/${uid}`).get();
  if (!adultSnap.exists) {
    throw new HttpsError("permission-denied", "User not found.");
  }
  const adult = adultSnap.data() as AdultUserData;
  if (adult.role !== "adult") {
    throw new HttpsError("permission-denied", "Only adults can delete children.");
  }
  const tenantId = typeof adult.tenantId === "string" ? adult.tenantId : null;
  if (!tenantId) {
    throw new HttpsError("failed-precondition", "Missing tenant.");
  }
  return tenantId;
}

async function deleteRefsInBatches(refs: DocumentReference[]): Promise<void> {
  for (let i = 0; i < refs.length; i += 450) {
    const batch = db.batch();
    refs.slice(i, i + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function deleteAuthUsers(uids: string[]): Promise<void> {
  for (let i = 0; i < uids.length; i += 1000) {
    const chunk = uids.slice(i, i + 1000);
    if (chunk.length === 0) continue;
    const result = await adminAuth.deleteUsers(chunk);
    if (result.failureCount > 0) {
      logger.warn("Failed to delete some child auth users", {
        errors: result.errors.map((e) => ({ uid: chunk[e.index], error: e.error.message })),
      });
    }
  }
}

async function deleteAudioFile(path: string): Promise<void> {
  try {
    await storageBucket.file(path).delete({ ignoreNotFound: true });
  } catch (e) {
    logger.warn("Failed to delete audio file", { path, error: e });
  }
}

async function preserveDeletedChildChatNames(
  memberId: string,
  tenantId: string,
  memberName: string
): Promise<QuerySnapshot> {
  const chatsSnap = await db
    .collection("chats")
    .where("tenantId", "==", tenantId)
    .where("participants", "array-contains", memberId)
    .get();

  let batch = db.batch();
  let n = 0;
  for (const chatDoc of chatsSnap.docs) {
    const chat = chatDoc.data() as {
      isGroup?: boolean;
      name?: string;
      participants?: string[];
    };
    const participants = Array.isArray(chat.participants) ? chat.participants : [];
    const name = typeof chat.name === "string" ? chat.name.trim() : "";
    if (chat.isGroup === true || participants.length !== 2 || name.length > 0) {
      continue;
    }
    batch.update(chatDoc.ref, {
      name: memberName,
      updatedAt: FieldValue.serverTimestamp(),
    });
    n++;
    if (n >= 450) {
      await batch.commit();
      batch = db.batch();
      n = 0;
    }
  }
  if (n > 0) await batch.commit();

  return chatsSnap;
}

async function deleteChildMessages(
  chatsSnap: QuerySnapshot,
  tenantId: string,
  memberId: string
): Promise<void> {
  for (const chatDoc of chatsSnap.docs) {
    const messagesSnap = await chatDoc.ref
      .collection("messages")
      .where("senderId", "==", memberId)
      .get();
    const refs: DocumentReference[] = [];
    for (const messageDoc of messagesSnap.docs) {
      const message = messageDoc.data() as MessageData;
      if (message.tenantId !== tenantId || message.senderId !== memberId) continue;
      if (typeof message.audioUrl === "string" && message.audioUrl.length > 0) {
        await deleteAudioFile(message.audioUrl);
      }
      refs.push(messageDoc.ref);
    }
    await deleteRefsInBatches(refs);
  }
}

async function deleteChildSessions(memberId: string, tenantId: string): Promise<string[]> {
  const usersSnap = await db.collection("users").where("memberId", "==", memberId).get();
  const uids: string[] = [];
  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data() as { tenantId?: string };
    if (userData.tenantId !== tenantId) continue;
    uids.push(userDoc.id);

    const devicesSnap = await db.collection("devices").where("userId", "==", userDoc.id).get();
    let deviceBatch = db.batch();
    let deviceCount = 0;
    for (const deviceDoc of devicesSnap.docs) {
      const device = deviceDoc.data() as { tenantId?: string };
      if (device.tenantId !== tenantId) continue;
      deviceBatch.update(deviceDoc.ref, {
        active: false,
        deactivationReason: "account-deleted",
      });
      deviceCount++;
      if (deviceCount >= 450) {
        await deviceBatch.commit();
        deviceBatch = db.batch();
        deviceCount = 0;
      }
    }
    if (deviceCount > 0) await deviceBatch.commit();

    await clearUserChatList(userDoc.id);
    await userDoc.ref.delete();
  }
  return uids;
}

export const deleteChildMember = onCall({ region: "southamerica-east1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const raw = request.data as {
    memberId?: unknown;
    deleteMessages?: unknown;
  };
  const memberId = typeof raw.memberId === "string" ? raw.memberId : null;
  const shouldDeleteMessages = raw.deleteMessages === true;
  if (!memberId) {
    throw new HttpsError("invalid-argument", "memberId is required.");
  }

  const tenantId = await assertTenantAdult(uid);
  const memberRef = db.doc(`members/${memberId}`);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) {
    throw new HttpsError("not-found", "Child not found.");
  }
  const member = memberSnap.data() as MemberData;
  if (member.tenantId !== tenantId) {
    throw new HttpsError("permission-denied", "Child belongs to another tenant.");
  }
  if (member.role !== "child") {
    throw new HttpsError("failed-precondition", "Only child users can be deleted here.");
  }
  const memberName = typeof member.name === "string" && member.name.trim().length > 0
    ? member.name.trim()
    : "Criança apagada";

  const chatsSnap = await preserveDeletedChildChatNames(memberId, tenantId, memberName);
  if (shouldDeleteMessages) {
    await deleteChildMessages(chatsSnap, tenantId, memberId);
  }

  const childAuthUids = await deleteChildSessions(memberId, tenantId);

  if (typeof member.loginCode === "string" && member.loginCode.length > 0) {
    await db.doc(`loginCodes/${member.loginCode}`).delete();
  }
  await memberRef.delete();
  await deleteAuthUsers(childAuthUids);

  return { ok: true };
});

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function isExpoPushToken(token: unknown): token is string {
  return typeof token === "string" && token.startsWith("ExponentPushToken[");
}

type ExpoTicket =
  | { status: "ok"; id?: string }
  | { status: "error"; message?: string; details?: { error?: string } };

type ExpoPushResponse = { data?: ExpoTicket[] };

async function clearInvalidPushTokens(tokens: string[]): Promise<void> {
  for (const token of tokens) {
    const snap = await db.collection("devices").where("pushToken", "==", token).limit(10).get();
    const batch = db.batch();
    snap.docs.forEach((d) => {
      batch.update(d.ref, { pushToken: FieldValue.delete() });
    });
    if (!snap.empty) await batch.commit();
  }
}

export const onChatMessageCreated = onDocumentCreated(
  {
    document: "chats/{chatId}/messages/{messageId}",
    region: "southamerica-east1",
  },
  async (event) => {
    const chatId = event.params.chatId;
    const messageId = event.params.messageId;
    const snap = event.data;
    if (!snap) return;

    const msg = snap.data() as {
      tenantId?: string;
      senderId?: string;
      audioUrl?: string | null;
      ciphertext?: string | null;
      iv?: string | null;
    };

    const tenantId = msg.tenantId;
    const senderMemberId = msg.senderId;
    if (
      !tenantId ||
      !senderMemberId ||
      typeof tenantId !== "string" ||
      typeof senderMemberId !== "string"
    ) {
      return;
    }

    const chatRef = db.doc(`chats/${chatId}`);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) return;

    const chat = chatSnap.data() as {
      participants?: string[];
      tenantId?: string;
    };

    if (chat.tenantId !== tenantId) return;

    const participants = Array.isArray(chat.participants) ? chat.participants : [];
    const recipients = participants.filter((p) => p !== senderMemberId);
    if (recipients.length === 0) return;

    const messageType: "text" | "audio" = msg.audioUrl ? "audio" : "text";

    const ciphertext = typeof msg.ciphertext === "string" ? msg.ciphertext : null;
    const iv = typeof msg.iv === "string" ? msg.iv : null;
    const MAX_PAYLOAD_CIPHERTEXT_BYTES = 3072;
    const includeCiphertext =
      messageType === "text" &&
      ciphertext !== null &&
      iv !== null &&
      ciphertext.length + iv.length <= MAX_PAYLOAD_CIPHERTEXT_BYTES;

    type PushRequest = {
      to: string[];
      data: {
        chatId: string;
        tenantId: string;
        messageId: string;
        senderId: string;
        type: "text" | "audio";
        ciphertext?: string;
        iv?: string;
      };
      channelId: string;
      priority: "high";
      _contentAvailable: true;
    };

    const requests: PushRequest[] = [];
    const tokenByFlatIndex: string[] = [];

    for (const memberId of recipients) {
      const usersSnap = await db.collection("users").where("memberId", "==", memberId).get();
      for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;
        const devicesSnap = await db.collection("devices").where("userId", "==", uid).get();
        const tokens: string[] = [];
        for (const dev of devicesSnap.docs) {
          const d = dev.data() as {
            pushToken?: string;
            tenantId?: string;
            approved?: boolean;
            active?: boolean;
          };
          if (d.tenantId !== tenantId || d.approved !== true) continue;
          if (d.active === false) continue;
          const t = d.pushToken;
          if (!isExpoPushToken(t)) continue;
          if (!tokens.includes(t)) tokens.push(t);
        }
        if (tokens.length === 0) continue;

        requests.push({
          to: tokens,
          data: {
            chatId,
            tenantId,
            messageId,
            senderId: senderMemberId,
            type: messageType,
            ...(includeCiphertext ? { ciphertext, iv } : {}),
          },
          channelId: "messages-v2",
          priority: "high",
          _contentAvailable: true,
        });
        for (const t of tokens) tokenByFlatIndex.push(t);
      }
    }

    if (requests.length === 0) return;

    let res: Response;
    try {
      res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requests),
      });
    } catch (e) {
      logger.error("Expo push fetch failed", e);
      return;
    }

    let json: ExpoPushResponse;
    try {
      json = (await res.json()) as ExpoPushResponse;
    } catch {
      logger.error("Expo push invalid JSON", { status: res.status });
      return;
    }

    const tickets = Array.isArray(json.data) ? json.data : [];
    const badTokens: string[] = [];
    tokenByFlatIndex.forEach((token, i) => {
      const ticket = tickets[i];
      if (!ticket || ticket.status !== "error") return;
      const err = ticket.details?.error;
      if (err === "DeviceNotRegistered" || err === "InvalidCredentials") {
        badTokens.push(token);
      }
    });

    if (badTokens.length > 0) {
      await clearInvalidPushTokens(badTokens);
    }
  }
);
