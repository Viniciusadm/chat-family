import { apiFetch } from "./client";

export type PendingDeviceDto = {
  id: string;
  user_id: string;
  member_id?: string;
  tenant_id?: string;
  name?: string;
  public_key?: string | null;
  created_at?: string;
};

export type KeyRecipientDeviceDto = {
  id: string;
  user_id: string;
  member_id: string;
  public_key: string;
  approved?: boolean;
  active?: boolean;
  created_at?: string;
};

export function createDevice(body: {
  device_id: string;
  push_token?: string | null;
  public_key?: string | null;
}) {
  return apiFetch<{ id: string }>("/devices", { method: "POST", body });
}

export function updateDevice(deviceId: string, body: {
  device_id: string;
  push_token?: string | null;
  public_key?: string | null;
}) {
  return apiFetch<{ ok: true }>(`/devices/${deviceId}`, { method: "PATCH", body });
}

export function heartbeat(deviceId: string) {
  return apiFetch<{ ok: true }>(`/devices/${deviceId}/heartbeat`, { method: "POST" });
}

export function getDeviceStatus(deviceId: string) {
  return apiFetch<{
    device_id: string;
    approved: boolean;
    active: boolean;
    reason: string | null;
  }>(`/devices/${deviceId}`);
}

export function listPendingDevices() {
  return apiFetch<PendingDeviceDto[]>("/admin/devices/pending");
}

export function listKeyRecipientDevices(memberIds: string[]) {
  const qs = new URLSearchParams();
  qs.set("member_ids", memberIds.join(","));
  return apiFetch<KeyRecipientDeviceDto[]>(
    `/admin/devices/key-recipients?${qs.toString()}`
  );
}

export function approveDevice(deviceId: string) {
  return apiFetch<{ ok: true }>(`/admin/devices/${deviceId}/approve`, { method: "POST" });
}

export function deleteDevice(deviceId: string) {
  return apiFetch<{ ok: true }>(`/admin/devices/${deviceId}`, { method: "DELETE" });
}
