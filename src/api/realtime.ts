import { API_WS_URL, apiFetch, getAccessToken } from "./client";

export type RealtimeEvent = {
  id: string;
  type: string;
  tenant_id: string;
  chat_id: string | null;
  entity_id: string | null;
  occurred_at: string;
  payload: Record<string, unknown>;
};

type Listener = (event: RealtimeEvent) => void;

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private stopped = true;
  private lastEventAt: string | null = null;

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async catchUp() {
    const qs = new URLSearchParams();
    if (this.lastEventAt) qs.set("after", this.lastEventAt);
    const suffix = qs.toString() ? `?${qs}` : "";
    const events = await apiFetch<RealtimeEvent[]>(`/realtime/events${suffix}`).catch(() => []);
    for (const event of events) this.dispatch(event);
  }

  private connect() {
    const token = getAccessToken();
    if (this.stopped || !token) return;
    const separator = API_WS_URL.includes("?") ? "&" : "?";
    const ws = new WebSocket(`${API_WS_URL}${separator}access_token=${encodeURIComponent(token)}`);
    this.socket = ws;

    ws.onopen = () => {
      this.attempts = 0;
      void this.catchUp();
    };
    ws.onmessage = (message) => {
      try {
        const data = JSON.parse(String(message.data));
        if (data?.type === "hello") return;
        this.dispatch(data as RealtimeEvent);
      } catch {}
    };
    ws.onclose = () => this.scheduleReconnect();
    ws.onerror = () => this.scheduleReconnect();
  }

  private dispatch(event: RealtimeEvent) {
    this.lastEventAt = event.occurred_at;
    this.listeners.forEach((listener) => listener(event));
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(30000, 1000 * 2 ** this.attempts);
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

export const realtimeClient = new RealtimeClient();
