import type { Timestamp } from "firebase/firestore";

export interface TenantDoc {
  name: string;
  ownerId: string;
  createdAt: Timestamp;
}

export interface MemberDoc {
  tenantId: string;
  name: string;
  role: "adult" | "child";
  loginCode: string | null;
  createdAt: Timestamp;
}

export interface LoginCodeDoc {
  memberId: string;
  tenantId: string;
  name: string;
  role: "adult" | "child";
}

export interface UserDoc {
  memberId?: string;
  tenantId: string;
  name: string;
  role: "adult" | "child";
  createdAt: Timestamp;
}

export interface DeviceDoc {
  tenantId: string;
  userId: string;
  approved: boolean;
  pushToken: string;
  createdAt: Timestamp;
}

export interface ChatDoc {
  tenantId: string;
  participants: string[];
  isGroup: boolean;
  name: string;
  lastMessageText: string | null;
  lastMessageAt: Timestamp | null;
  lastMessageType: "text" | "audio" | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  readUpTo?: Record<string, Timestamp>;
}

export interface MessageDoc {
  tenantId: string;
  senderId: string;
  text: string | null;
  audioUrl: string | null;
  audioDuration: number | null;
  createdAt: Timestamp;
}

export type UserRole = "adult" | "child";

export interface AppUser {
  id: string;
  tenantId: string;
  name: string;
  role: UserRole;
}

export interface AppMember extends AppUser {
  loginCode: string | null;
}

export interface Device {
  id: string;
  tenantId: string;
  userId: string;
  approved: boolean;
  pushToken: string;
  createdAt: Date;
}

export interface Chat {
  id: string;
  tenantId: string;
  participants: string[];
  isGroup: boolean;
  name: string;
  readUpTo?: Record<string, Timestamp>;
  lastMessage?: {
    text: string | null;
    type: "text" | "audio" | null;
    timestamp: Date;
  };
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  type: "text" | "audio";
  content: string;
  audioUrl?: string;
  audioDuration?: number;
  timestamp: Date;
  createdAtMs: number;
}
