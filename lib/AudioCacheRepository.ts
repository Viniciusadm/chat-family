import { MessageRepository } from "@/lib/MessageRepository";
import * as FileSystem from "expo-file-system/legacy";

const AUDIO_CACHE_DIR = `${FileSystem.documentDirectory ?? ""}audio-cache`;
const inFlightDownloads = new Set<string>();

function extensionFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\.([a-zA-Z0-9]+)$/);
    return match?.[1]?.toLowerCase() ?? "m4a";
  } catch {
    return "m4a";
  }
}

async function ensureAudioCacheDir(chatId: string): Promise<string | null> {
  if (!FileSystem.documentDirectory) return null;
  const chatDir = `${AUDIO_CACHE_DIR}/${encodeURIComponent(chatId)}`;
  await FileSystem.makeDirectoryAsync(chatDir, { intermediates: true }).catch(() => {});
  return chatDir;
}

export const AudioCacheRepository = {
  async downloadMessageAudio({
    chatId,
    messageId,
    remoteUrl,
  }: {
    chatId: string;
    messageId: string;
    remoteUrl: string;
  }): Promise<string | null> {
    if (!remoteUrl || !FileSystem.documentDirectory) return null;

    const downloadKey = `${chatId}:${messageId}`;
    if (inFlightDownloads.has(downloadKey)) return null;
    inFlightDownloads.add(downloadKey);

    try {
      const chatDir = await ensureAudioCacheDir(chatId);
      if (!chatDir) return null;

      const fileUri = `${chatDir}/${encodeURIComponent(messageId)}.${extensionFromUrl(remoteUrl)}`;
      const existing = await FileSystem.getInfoAsync(fileUri);
      if (existing.exists && existing.size > 0) {
        await MessageRepository.updateLocalAudioUri(messageId, fileUri);
        return fileUri;
      }

      const result = await FileSystem.downloadAsync(remoteUrl, fileUri);
      if (result.status < 200 || result.status >= 300) return null;

      const info = await FileSystem.getInfoAsync(result.uri);
      if (!info.exists || info.size <= 0) return null;

      await MessageRepository.updateLocalAudioUri(messageId, result.uri);
      return result.uri;
    } catch {
      return null;
    } finally {
      inFlightDownloads.delete(downloadKey);
    }
  },
};
