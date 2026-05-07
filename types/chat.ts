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
  photoUrl?: string | null;
  photoPath?: string | null;
}

export interface LoginCodeDoc {
  memberId: string;
  tenantId: string;
  name: string;
  role: "adult" | "child";
}

export interface PasswordVerifierField {
  ciphertext: string;
  iv: string;
}

export interface KeyBackupDoc {
  ciphertext: string;
  iv: string;
  encVersion: number;
  createdAt: Timestamp;
}

export interface UserDoc {
  memberId?: string;
  tenantId: string;
  name: string;
  role: "adult" | "child";
  createdAt: Timestamp;
  chatIndexBuiltAt?: Timestamp;
  photoUrl?: string | null;
  photoPath?: string | null;
  passwordSalt?: string;
  passwordVerifier?: PasswordVerifierField;
}

export interface DeviceDoc {
  tenantId: string;
  userId: string;
  approved: boolean;
  active?: boolean;
  pushToken: string;
  publicKey?: string;
  createdAt: Timestamp;
  lastActiveAt?: Timestamp;
  sessionAt?: Timestamp;
}

export interface KeyShareDoc {
  ephemeralPublicKey: string;
  iv: string;
  ciphertext: string;
  wrappedBy: string;
  createdAt: Timestamp;
}

export interface ChatDoc {
  tenantId: string;
  participants: string[];
  isGroup: boolean;
  name: string;
  photoUrl?: string | null;
  photoPath?: string | null;
  lastMessageText: string | null;
  lastMessageCiphertext: string | null;
  lastMessageIv: string | null;
  lastMessageAt: Timestamp | null;
  lastMessageType: "text" | "audio" | "image" | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  readUpTo?: Record<string, Timestamp>;
  unreadBy?: Record<string, number>;
}

export interface MessageDoc {
  tenantId: string;
  senderId: string;
  text: string | null;
  audioUrl: string | null;
  audioDuration: number | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageFileSize?: number | null;
  ciphertext?: string | null;
  iv?: string | null;
  encVersion?: number;
  replyTo?: MessageReplySnapshot | null;
  createdAt: Timestamp;
  editedAt?: Timestamp | null;
  isDeleted?: boolean;
  deletedAt?: Timestamp | null;
}

export interface Reaction {
  userId: string;
  emoji: string;
}

export interface ReactionDoc {
  messageId: string;
  userId: string;
  emoji: string;
  updatedAt: Timestamp;
}

export type UserRole = "adult" | "child";
export type MessageType = "text" | "audio" | "image";
export type MessageReplyType = MessageType;
export type MessageStatus = "loading" | "sent" | "failed";

export interface MessageReplySnapshot {
  id: string;
  senderId: string;
  senderName: string;
  type: MessageReplyType;
  preview: string;
}

export interface AppUser {
  id: string;
  tenantId: string;
  name: string;
  role: UserRole;
  photoUrl?: string | null;
  photoPath?: string | null;
}

export interface AppMember extends AppUser {
  loginCode: string | null;
}

export interface Device {
  id: string;
  tenantId: string;
  userId: string;
  approved: boolean;
  active?: boolean;
  pushToken: string;
  createdAt: Date;
}

export interface Chat {
  id: string;
  tenantId: string;
  participants: string[];
  isGroup: boolean;
  name: string;
  photoUrl?: string | null;
  photoPath?: string | null;
  unreadCount: number;
  readUpTo?: Record<string, Timestamp>;
  lastMessage?: {
    text: string | null;
    type: "text" | "audio" | "image" | null;
    timestamp: Date;
  };
}

export type MessagePendingOp = "update" | "delete";

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  type: MessageType;
  content: string;
  audioUrl?: string;
  audioRemoteUrl?: string;
  audioLocalUri?: string;
  audioDuration?: number;
  imageUrl?: string;
  imageRemoteUrl?: string;
  imageLocalUri?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageFileSize?: number;
  imagePendingSourceUri?: string;
  timestamp: Date;
  createdAtMs: number;
  status?: MessageStatus;
  replyTo?: MessageReplySnapshot;
  reactions?: Reaction[];
  decryptionFailed?: boolean;
  isEdited?: boolean;
  editedAt?: Date | null;
  isDeleted?: boolean;
  deletedAt?: Date | null;
  pendingOp?: MessagePendingOp | null;
}
