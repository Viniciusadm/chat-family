import * as MediaLibrary from "expo-media-library";

const ALBUM_NAME = "Chat Family";
const inFlightSaves = new Set<string>();

async function ensurePermission(): Promise<boolean> {
  try {
    const current = await MediaLibrary.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const requested = await MediaLibrary.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

export const ImageGalleryRepository = {
  /**
   * Salva o arquivo local no álbum público "Chat Family".
   * Android: /Pictures/Chat Family/. iOS: álbum "Chat Family" no app Fotos.
   * Permissão negada ou erro: retorna silenciosamente.
   */
  async saveToGallery({
    messageId,
    fileUri,
  }: {
    messageId: string;
    fileUri: string;
  }): Promise<void> {
    if (inFlightSaves.has(messageId)) return;
    inFlightSaves.add(messageId);
    try {
      const granted = await ensurePermission();
      if (!granted) return;

      const asset = await MediaLibrary.createAssetAsync(fileUri);
      const album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
      if (album) {
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      } else {
        await MediaLibrary.createAlbumAsync(ALBUM_NAME, asset, false);
      }
    } catch {
      // Permissão negada ou erro — não quebra envio.
    } finally {
      inFlightSaves.delete(messageId);
    }
  },
};
