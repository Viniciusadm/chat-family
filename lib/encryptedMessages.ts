import { decryptText, encryptText } from "./crypto/symmetric";
import { getConversationKey } from "./conversationKeys";
import type { MessageDoc } from "@/types/chat";

export async function encryptMessageText(
  chatId: string,
  plaintext: string,
): Promise<{ ciphertext: string; iv: string } | null> {
  const key = await getConversationKey(chatId);
  if (!key) return null;
  return encryptText(key, plaintext);
}

export type IncomingEncryptedMessage = Pick<
  MessageDoc,
  "ciphertext" | "iv" | "text"
>;

export async function decryptIncomingMessage(
  chatId: string,
  msg: IncomingEncryptedMessage,
): Promise<string | null> {
  if (msg.ciphertext && msg.iv) {
    const key = await getConversationKey(chatId);
    if (!key) return null;
    try {
      return decryptText(key, msg.ciphertext, msg.iv);
    } catch {
      return null;
    }
  }
  return msg.text ?? null;
}
