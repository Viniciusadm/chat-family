import { MessageRepository } from "@/lib/MessageRepository";
import * as FileSystem from "expo-file-system/legacy";

const IMAGE_CACHE_DIR = `${FileSystem.documentDirectory ?? ""}image-cache`;
const inFlightDownloads = new Set<string>();

function extensionFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\.([a-zA-Z0-9]+)$/);
    return match?.[1]?.toLowerCase() ?? "jpg";
  } catch {
    return "jpg";
  }
}

async function ensureChatDir(chatId: string): Promise<string | null> {
  if (!FileSystem.documentDirectory) return null;
  const chatDir = `${IMAGE_CACHE_DIR}/${encodeURIComponent(chatId)}`;
  await FileSystem.makeDirectoryAsync(chatDir, { intermediates: true }).catch(
    () => {}
  );
  return chatDir;
}

async function getUsableFileUri(
  uri: string | null | undefined
): Promise<string | null> {
  if (!uri) return null;
  const info = await FileSystem.getInfoAsync(uri).catch(() => null);
  return info?.exists && info.size > 0 ? uri : null;
}

async function expectedFileUri(
  chatId: string,
  messageId: string,
  remoteUrl: string,
  variant: "full" | "thumb"
): Promise<string | null> {
  const dir = await ensureChatDir(chatId);
  if (!dir) return null;
  const suffix = variant === "thumb" ? "_thumb" : "";
  return `${dir}/${encodeURIComponent(messageId)}${suffix}.${extensionFromUrl(remoteUrl)}`;
}

export const ImageCacheRepository = {
  async copyLocalSource({
    chatId,
    messageId,
    sourceUri,
    variant,
  }: {
    chatId: string;
    messageId: string;
    sourceUri: string;
    variant: "full" | "thumb";
  }): Promise<string | null> {
    const dest = await expectedFileUri(chatId, messageId, sourceUri, variant);
    if (!dest) return null;
    await FileSystem.copyAsync({ from: sourceUri, to: dest }).catch(() => {});
    return getUsableFileUri(dest);
  },

  async ensureMessageImageCache({
    chatId,
    messageId,
    remoteUrl,
    localUri,
    variant,
    download,
  }: {
    chatId: string;
    messageId: string;
    remoteUrl: string;
    localUri?: string | null;
    variant: "full" | "thumb";
    download: boolean;
  }): Promise<string | null> {
    if (!remoteUrl || !FileSystem.documentDirectory) return null;

    const usableLocalUri = await getUsableFileUri(localUri);
    if (usableLocalUri) return usableLocalUri;

    const fileUri = await expectedFileUri(chatId, messageId, remoteUrl, variant);
    const usableExpected = await getUsableFileUri(fileUri);
    if (usableExpected) {
      await MessageRepository.updateLocalImageUri(messageId, variant, usableExpected);
      return usableExpected;
    }

    if (!download) return null;
    return this.downloadMessageImage({ chatId, messageId, remoteUrl, variant });
  },

  async downloadMessageImage({
    chatId,
    messageId,
    remoteUrl,
    variant,
  }: {
    chatId: string;
    messageId: string;
    remoteUrl: string;
    variant: "full" | "thumb";
  }): Promise<string | null> {
    if (!remoteUrl || !FileSystem.documentDirectory) return null;

    const downloadKey = `${chatId}:${messageId}:${variant}`;
    if (inFlightDownloads.has(downloadKey)) return null;
    inFlightDownloads.add(downloadKey);

    try {
      const fileUri = await expectedFileUri(chatId, messageId, remoteUrl, variant);
      if (!fileUri) return null;

      const existing = await getUsableFileUri(fileUri);
      if (existing) {
        await MessageRepository.updateLocalImageUri(messageId, variant, existing);
        return existing;
      }

      const result = await FileSystem.downloadAsync(remoteUrl, fileUri);
      if (result.status < 200 || result.status >= 300) return null;

      const info = await FileSystem.getInfoAsync(result.uri);
      if (!info.exists || info.size <= 0) return null;

      await MessageRepository.updateLocalImageUri(messageId, variant, result.uri);
      return result.uri;
    } catch {
      return null;
    } finally {
      inFlightDownloads.delete(downloadKey);
    }
  },
};
