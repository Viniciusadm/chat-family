import { apiFetch } from "./client";
import type { UserRole } from "@/types/chat";

export type MemberDto = {
  id: string;
  name: string;
  role: UserRole;
  login_code?: string | null;
  photo_url?: string | null;
  photo_path?: string | null;
  created_at?: string;
};

export function listMembers() {
  return apiFetch<MemberDto[]>("/members");
}

export function createMember(body: {
  name?: string;
  role?: UserRole;
  photo_url?: string | null;
  photo_path?: string | null;
}) {
  return apiFetch<{ id: string; login_code?: string | null }>("/members", {
    method: "POST",
    body,
  });
}

export function updateMember(memberId: string, body: {
  name?: string;
  role?: UserRole;
  photo_url?: string | null;
  photo_path?: string | null;
}) {
  return apiFetch<{ ok: true }>(`/members/${memberId}`, { method: "PATCH", body });
}

export function deleteMember(memberId: string) {
  return apiFetch<{ ok: true }>(`/members/${memberId}`, { method: "DELETE" });
}
