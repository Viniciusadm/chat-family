import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

const MAX_DIMENSION = 1600;
const QUALITY = 0.82;

export interface ProcessedImage {
  uri: string;
  width: number;
  height: number;
  fileSize: number;
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
  const resize = pickResize(sourceWidth, sourceHeight, MAX_DIMENSION);
  const result = await ImageManipulator.manipulateAsync(
    sourceUri,
    resize ? [{ resize }] : [],
    { compress: QUALITY, format: ImageManipulator.SaveFormat.JPEG }
  );

  const size = await fileSize(result.uri);

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    fileSize: size,
  };
}
