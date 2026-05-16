import { apiFetch, clearTokens, setTokens } from "./client";

export type ApiRole = "adult" | "child";

export type ApiUser = {
  id: string;
  member_id: string;
  tenant_id: string;
  name: string;
  role: ApiRole;
  email: string | null;
  device_id: string | null;
};

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  user: ApiUser;
};

export async function register(body: {
  email: string;
  password: string;
  name: string;
  device_id?: string;
  push_token?: string | null;
  public_key?: string | null;
}) {
  const response = await apiFetch<TokenResponse>("/auth/register", {
    method: "POST",
    body,
    auth: false,
  });
  await setTokens(response);
  return response;
}

export async function login(body: {
  email: string;
  password: string;
  device_id: string;
  push_token?: string | null;
  public_key?: string | null;
}) {
  const response = await apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    body,
    auth: false,
  });
  await setTokens(response);
  return response;
}

export async function childLogin(body: {
  code: string;
  device_id: string;
  push_token?: string | null;
  public_key?: string | null;
}) {
  const response = await apiFetch<TokenResponse>("/auth/child-login", {
    method: "POST",
    body,
    auth: false,
  });
  await setTokens(response);
  return response;
}

export function me() {
  return apiFetch<ApiUser>("/auth/me");
}

export async function logout() {
  await apiFetch<{ ok: true }>("/auth/logout", { method: "POST" }).catch(() => null);
  await clearTokens();
}
