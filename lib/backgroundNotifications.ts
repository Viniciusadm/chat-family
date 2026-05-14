import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { doc, getDoc } from "firebase/firestore";
import { Platform } from "react-native";
import { db } from "./firebase";
import { decryptIncomingMessage } from "./encryptedMessages";

export const BACKGROUND_NOTIFICATION_TASK = "e2e-background-notification";

// TODO(iOS): Showing decrypted previews on iOS requires a Notification Service
// Extension (mutable-content payload) that decrypts using a shared SecureStore
// (Keychain access group). For now we register the task on iOS too, but iOS will
// only update the notification AFTER the app is opened. Android delivers
// data-only pushes to this task in the background.

type BackgroundData = {
  chatId?: unknown;
  messageId?: unknown;
  senderId?: unknown;
  tenantId?: unknown;
  type?: unknown;
  ciphertext?: unknown;
  iv?: unknown;
};

function readPayload(input: unknown): BackgroundData {
  if (input && typeof input === "object" && "data" in input) {
    const inner = (input as { data?: unknown }).data;
    if (inner && typeof inner === "object") return inner as BackgroundData;
  }
  if (input && typeof input === "object") return input as BackgroundData;
  return {};
}

async function resolveSenderName(memberId: string): Promise<string> {
  if (!memberId) return "Família";
  try {
    const snap = await getDoc(doc(db, "members", memberId));
    if (!snap.exists()) return "Família";
    const data = snap.data() as { name?: unknown };
    return typeof data.name === "string" && data.name.length > 0 ? data.name : "Família";
  } catch {
    return "Família";
  }
}

const ANDROID_TRIGGER =
  Platform.OS === "android" ? ({ channelId: "messages-v2" } as const) : null;

async function scheduleNotification(title: string, body: string, chatId: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { chatId } },
    trigger: ANDROID_TRIGGER,
  });
}

async function scheduleFallback(chatId: string, senderName: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: senderName || "Família",
      body: "Nova mensagem",
      data: { chatId },
    },
    trigger: ANDROID_TRIGGER,
  });
}

async function scheduleDebug(label: string) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "[debug] bg-task",
        body: label,
      },
      trigger: ANDROID_TRIGGER,
    });
  } catch {
    // best-effort
  }
}

const MAX_BODY_LENGTH = 120;

function truncateBody(text: string): string {
  if (text.length <= MAX_BODY_LENGTH) return text;
  return text.slice(0, MAX_BODY_LENGTH) + "...";
}

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error) {
    await scheduleDebug(`taskError=${String(error)}`);
    return;
  }
  const trace: string[] = [];
  try {
    const payload = readPayload(data);
    const chatId = typeof payload.chatId === "string" ? payload.chatId : "";
    const messageId = typeof payload.messageId === "string" ? payload.messageId : "";
    const senderId = typeof payload.senderId === "string" ? payload.senderId : "";
    trace.push(`chat=${chatId ? "y" : "n"}`);
    trace.push(`msg=${messageId ? "y" : "n"}`);
    if (!chatId || !messageId) {
      await scheduleDebug(trace.join(" "));
      return;
    }

    const senderName = await resolveSenderName(senderId);
    const payloadType = typeof payload.type === "string" ? payload.type : "";
    trace.push(`type=${payloadType || "text"}`);

    if (payloadType === "audio") {
      await scheduleNotification(senderName, "Áudio", chatId);
      await scheduleDebug(trace.join(" ") + " path=audio");
      return;
    }

    let plaintext: string | null = null;

    const payloadCiphertext = typeof payload.ciphertext === "string" ? payload.ciphertext : null;
    const payloadIv = typeof payload.iv === "string" ? payload.iv : null;
    trace.push(`payloadCt=${payloadCiphertext ? "y" : "n"}`);

    if (payloadCiphertext && payloadIv) {
      plaintext = await decryptIncomingMessage(chatId, {
        ciphertext: payloadCiphertext,
        iv: payloadIv,
        text: null,
      });
      trace.push(`pt1=${plaintext === null ? "null" : `len${plaintext.length}`}`);
    }

    if (plaintext === null) {
      const msgSnap = await getDoc(doc(db, "chats", chatId, "messages", messageId));
      if (!msgSnap.exists()) {
        trace.push("snap=missing");
        await scheduleFallback(chatId, senderName);
        await scheduleDebug(trace.join(" "));
        return;
      }
      const msg = msgSnap.data() as {
        ciphertext?: string;
        iv?: string;
        text?: string | null;
        audioUrl?: string | null;
      };
      if (msg.audioUrl) {
        await scheduleNotification(senderName, "Áudio", chatId);
        await scheduleDebug(trace.join(" ") + " path=audioFs");
        return;
      }
      plaintext = await decryptIncomingMessage(chatId, {
        ciphertext: msg.ciphertext ?? null,
        iv: msg.iv ?? null,
        text: msg.text ?? null,
      });
      trace.push(`pt2=${plaintext === null ? "null" : `len${plaintext.length}`}`);
    }

    if (plaintext === null || plaintext.trim().length === 0) {
      await scheduleFallback(chatId, senderName);
      await scheduleDebug(trace.join(" ") + " path=fallback");
      return;
    }

    await scheduleNotification(senderName, truncateBody(plaintext), chatId);
    await scheduleDebug(trace.join(" ") + " path=ok");
  } catch (e) {
    await scheduleDebug(trace.join(" ") + ` throw=${e instanceof Error ? e.message : String(e)}`);
  }
});

export async function registerBackgroundNotificationTask(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
  } catch {
    // Already registered or unsupported environment.
  }
}
