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

async function getUsableFileUri(uri: string | null | undefined): Promise<string | null> {
  if (!uri) return null;
  const info = await FileSystem.getInfoAsync(uri).catch(() => null);
  return info?.exists && info.size > 0 ? uri : null;
}

async function expectedAudioFileUri({
  chatId,
  messageId,
  remoteUrl,
}: {
  chatId: string;
  messageId: string;
  remoteUrl: string;
}): Promise<string | null> {
  const chatDir = await ensureAudioCacheDir(chatId);
  if (!chatDir) return null;
  return `${chatDir}/${encodeURIComponent(messageId)}.${extensionFromUrl(remoteUrl)}`;
}

export const AudioCacheRepository = {
  async ensureMessageAudioCache({
    chatId,
    messageId,
    remoteUrl,
    localUri,
    download,
  }: {
    chatId: string;
    messageId: string;
    remoteUrl: string;
    localUri?: string | null;
    download: boolean;
  }): Promise<string | null> {
    if (!remoteUrl || !FileSystem.documentDirectory) return null;

    const usableLocalUri = await getUsableFileUri(localUri);
    if (usableLocalUri) return usableLocalUri;

    if (localUri) {
      await MessageRepository.clearLocalAudioUri(messageId);
    }

    const fileUri = await expectedAudioFileUri({ chatId, messageId, remoteUrl });
    const usableExpectedUri = await getUsableFileUri(fileUri);
    if (usableExpectedUri) {
      await MessageRepository.updateLocalAudioUri(messageId, usableExpectedUri);
      return usableExpectedUri;
    }

    if (!download) return null;

    return this.downloadMessageAudio({ chatId, messageId, remoteUrl });
  },

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
      const fileUri = await expectedAudioFileUri({ chatId, messageId, remoteUrl });
      if (!fileUri) return null;

      const existingUri = await getUsableFileUri(fileUri);
      if (existingUri) {
        await MessageRepository.updateLocalAudioUri(messageId, existingUri);
        return existingUri;
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
