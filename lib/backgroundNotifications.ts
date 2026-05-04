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

async function scheduleNotification(title: string, body: string, chatId: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { chatId } },
    trigger: null,
  });
}

async function scheduleFallback(chatId: string, senderName: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: senderName || "Família",
      body: "Nova mensagem",
      data: { chatId },
    },
    trigger: null,
  });
}

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error) return;
  try {
    const payload = readPayload(data);
    const chatId = typeof payload.chatId === "string" ? payload.chatId : "";
    const messageId = typeof payload.messageId === "string" ? payload.messageId : "";
    const senderId = typeof payload.senderId === "string" ? payload.senderId : "";
    if (!chatId || !messageId) return;

    const senderName = await resolveSenderName(senderId);

    const msgSnap = await getDoc(doc(db, "chats", chatId, "messages", messageId));
    if (!msgSnap.exists()) {
      await scheduleFallback(chatId, senderName);
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
      return;
    }
    const plaintext = await decryptIncomingMessage(chatId, {
      ciphertext: msg.ciphertext ?? null,
      iv: msg.iv ?? null,
      text: msg.text ?? null,
    });
    if (plaintext == null) {
      await scheduleFallback(chatId, senderName);
      return;
    }
    await scheduleNotification(senderName, plaintext, chatId);
  } catch {
    // Silent — without a notification block, no user-visible failure.
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
