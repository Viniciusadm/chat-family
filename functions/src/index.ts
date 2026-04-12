import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";

initializeApp();
const db = getFirestore();

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
    region: "europe-west1",
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
