import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";

initializeApp();
const db = getFirestore();

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
    const snap = event.data;
    if (!snap) return;

    const msg = snap.data() as {
      tenantId?: string;
      senderId?: string;
      text?: string | null;
      audioUrl?: string | null;
    };

    const tenantId = msg.tenantId;
    const senderMemberId = msg.senderId;
    if (!tenantId || !senderMemberId || typeof tenantId !== "string" || typeof senderMemberId !== "string") {
      return;
    }

    const chatRef = db.doc(`chats/${chatId}`);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) return;

    const chat = chatSnap.data() as {
      participants?: string[];
      name?: string;
      isGroup?: boolean;
      tenantId?: string;
    };

    if (chat.tenantId !== tenantId) return;

    const participants = Array.isArray(chat.participants) ? chat.participants : [];
    const recipients = participants.filter((p) => p !== senderMemberId);
    if (recipients.length === 0) return;

    const memberSnap = await db.doc(`members/${senderMemberId}`).get();
    const senderName =
      memberSnap.exists && typeof (memberSnap.data() as { name?: string }).name === "string"
        ? (memberSnap.data() as { name: string }).name
        : "Alguém";

    const title =
      chat.isGroup === true && typeof chat.name === "string" && chat.name.length > 0
        ? chat.name
        : senderName;

    let body: string;
    if (msg.text != null && String(msg.text).trim().length > 0) {
      body = String(msg.text).trim();
    } else if (msg.audioUrl) {
      body = "Áudio";
    } else {
      body = "Nova mensagem";
    }

    const uniqueTokensSet = new Set<string>();

    for (const memberId of recipients) {
      const usersSnap = await db.collection("users").where("memberId", "==", memberId).get();
      for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;
        const devicesSnap = await db.collection("devices").where("userId", "==", uid).get();
        for (const dev of devicesSnap.docs) {
          const d = dev.data() as {
            pushToken?: string;
            tenantId?: string;
            approved?: boolean;
          };
          if (d.tenantId !== tenantId || d.approved !== true) continue;
          const t = d.pushToken;
          if (!isExpoPushToken(t)) continue;
          uniqueTokensSet.add(t);
        }
      }
    }

    const uniqueTokens = [...uniqueTokensSet];
    if (uniqueTokens.length === 0) return;

    let res: Response;
    try {
      res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: uniqueTokens,
          title,
          body,
          data: { chatId, tenantId },
          channelId: "default",
        }),
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
    uniqueTokens.forEach((token, i) => {
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
