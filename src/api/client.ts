import AsyncStorage from "@react-native-async-storage/async-storage";

const ACCESS_TOKEN_KEY = "chat_back.access_token";
const REFRESH_TOKEN_KEY = "chat_back.refresh_token";

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  auth?: boolean;
  retry?: boolean;
};

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

export const API_BASE_URL = env?.VITE_API_BASE_URL ?? "http://localhost:3000";
export const API_WS_URL = env?.VITE_API_WS_URL ?? "ws://localhost:3000/realtime";
export const MEDIA_BASE_URL = env?.VITE_MEDIA_BASE_URL ?? "http://localhost:3000";

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;
const logoutListeners = new Set<() => void>();

export async function loadStoredTokens() {
  const [access, refresh] = await Promise.all([
    AsyncStorage.getItem(ACCESS_TOKEN_KEY),
    AsyncStorage.getItem(REFRESH_TOKEN_KEY),
  ]);
  accessToken = access;
  refreshToken = refresh;
  return { accessToken, refreshToken };
}

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  return refreshToken;
}

export async function setTokens(tokens: { access_token: string; refresh_token: string }) {
  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;
  await AsyncStorage.multiSet([
    [ACCESS_TOKEN_KEY, accessToken],
    [REFRESH_TOKEN_KEY, refreshToken],
  ]);
}

export async function clearTokens() {
  accessToken = null;
  refreshToken = null;
  await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
}

export function onApiLogout(listener: () => void) {
  logoutListeners.add(listener);
  return () => logoutListeners.delete(listener);
}

async function emitLogout() {
  await clearTokens();
  logoutListeners.forEach((listener) => listener());
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => null);
    if (!response?.ok) return false;
    const data = await parseResponse(response) as {
      access_token?: string;
      refresh_token?: string;
    } | null;
    if (!data?.access_token || !data.refresh_token) return false;
    await setTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    return true;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  const needsAuth = options.auth !== false;
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;

  if (needsAuth && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (options.body !== undefined && !isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body:
      options.body === undefined
        ? undefined
        : isForm
          ? options.body as BodyInit
          : JSON.stringify(options.body),
  });

  if (response.status === 401 && needsAuth && options.retry !== false) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiFetch<T>(path, { ...options, retry: false });
    }
    await emitLogout();
  }

  const data = await parseResponse(response);
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new ApiError(response.status, message, data);
  }
  return data as T;
}

export async function healthCheck() {
  return apiFetch<{ ok: boolean }>("/health", { auth: false });
}
