import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

const MAX_FULL_DIMENSION = 1600;
const MAX_THUMB_DIMENSION = 320;
const FULL_QUALITY = 0.82;
const THUMB_QUALITY = 0.7;

export interface ProcessedImage {
  full: { uri: string; width: number; height: number; fileSize: number };
  thumbnail: { uri: string; width: number; height: number; fileSize: number };
}

function pickResize(width: number, height: number, max: number) {
  if (!width || !height) return undefined;
  if (width <= max && height <= max) return undefined;
  return width >= height ? { width: max } : { height: max };
}

async function fileSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && typeof info.size === "number" ? info.size : 0;
}

export async function processImageForUpload(
  sourceUri: string,
  sourceWidth: number,
  sourceHeight: number
): Promise<ProcessedImage> {
  const fullResize = pickResize(sourceWidth, sourceHeight, MAX_FULL_DIMENSION);
  const fullResult = await ImageManipulator.manipulateAsync(
    sourceUri,
    fullResize ? [{ resize: fullResize }] : [],
    { compress: FULL_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
  );

  const thumbResize = pickResize(
    fullResult.width,
    fullResult.height,
    MAX_THUMB_DIMENSION
  );
  const thumbResult = await ImageManipulator.manipulateAsync(
    fullResult.uri,
    thumbResize ? [{ resize: thumbResize }] : [],
    { compress: THUMB_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
  );

  const [fullSize, thumbSize] = await Promise.all([
    fileSize(fullResult.uri),
    fileSize(thumbResult.uri),
  ]);

  return {
    full: {
      uri: fullResult.uri,
      width: fullResult.width,
      height: fullResult.height,
      fileSize: fullSize,
    },
    thumbnail: {
      uri: thumbResult.uri,
      width: thumbResult.width,
      height: thumbResult.height,
      fileSize: thumbSize,
    },
  };
}
