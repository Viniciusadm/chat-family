import { apiFetch } from "./client";

export type UploadResponse = {
  url: string;
  path?: string;
  width?: number;
  height?: number;
  size_bytes?: number;
};

function formData(file: { uri: string; name?: string; type?: string } | Blob | Uint8Array | ArrayBuffer) {
  const data = new FormData();
  if (file instanceof Uint8Array || file instanceof ArrayBuffer) {
    const bytes = file instanceof Uint8Array ? file.slice() : file;
    data.append("file", new Blob([bytes as ArrayBuffer]));
  } else if (typeof Blob !== "undefined" && file instanceof Blob) {
    data.append("file", file);
  } else {
    const item = file as { uri: string; name?: string; type?: string };
    data.append("file", {
      uri: item.uri,
      name: item.name ?? "upload",
      type: item.type ?? "application/octet-stream",
    } as unknown as Blob);
  }
  return data;
}

export function uploadProfilePhoto(file: { uri: string; name?: string; type?: string }) {
  return apiFetch<UploadResponse>("/media/profile-photo", {
    method: "POST",
    body: formData(file),
  });
}

export function deleteProfilePhoto() {
  return apiFetch<{ ok: true }>("/media/profile-photo", { method: "DELETE" });
}

export function uploadChatPhoto(chatId: string, file: { uri: string; name?: string; type?: string }) {
  return apiFetch<UploadResponse>(`/chats/${chatId}/photo/upload`, {
    method: "POST",
    body: formData(file),
  });
}

export function uploadMessageAudio(
  chatId: string,
  messageId: string,
  file: Blob | Uint8Array | ArrayBuffer,
) {
  return apiFetch<UploadResponse>(`/chats/${chatId}/messages/${messageId}/audio`, {
    method: "POST",
    body: formData(file),
  });
}

export function uploadMessageImage(
  chatId: string,
  messageId: string,
  file: { uri: string; name?: string; type?: string },
) {
  return apiFetch<UploadResponse>(`/chats/${chatId}/messages/${messageId}/image`, {
    method: "POST",
    body: formData(file),
  });
}
