import { getDatabase, withExclusiveWrite } from "@/lib/db";
import type { AppMember, Device } from "@/types/chat";

type AdminMemberRow = {
  id: string;
  tenant_id: string;
  name: string;
  role: string;
  login_code: string | null;
  photo_url: string | null;
  photo_path: string | null;
};

type AdminSessionUserRow = {
  user_id: string;
  name: string;
};

type AdminPendingDeviceRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  approved: number;
  push_token: string;
  created_at: string;
};

type Listener = () => void;

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

function rowToMember(row: AdminMemberRow): AppMember {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    role: row.role === "child" ? "child" : "adult",
    loginCode: row.login_code,
    photoUrl: row.photo_url,
    photoPath: row.photo_path,
  };
}

function rowToDevice(row: AdminPendingDeviceRow): Device {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    approved: row.approved === 1,
    pushToken: row.push_token,
    createdAt: new Date(row.created_at),
  };
}

export const AdminRepository = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  async getMembers(tenantId: string): Promise<AppMember[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<AdminMemberRow>(
      `SELECT *
       FROM admin_members
       WHERE tenant_id = ?
       ORDER BY role ASC, name ASC`,
      [tenantId]
    );

    return rows.map(rowToMember);
  },

  async getSessionUserNames(tenantId: string): Promise<Record<string, string>> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<AdminSessionUserRow>(
      `SELECT user_id, name
       FROM admin_session_users
       WHERE tenant_id = ?`,
      [tenantId]
    );

    return Object.fromEntries(rows.map((row) => [row.user_id, row.name]));
  },

  async getPendingDevices(tenantId: string): Promise<Device[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<AdminPendingDeviceRow>(
      `SELECT *
       FROM admin_pending_devices
       WHERE tenant_id = ?
       ORDER BY created_at DESC`,
      [tenantId]
    );

    return rows.map(rowToDevice);
  },

  async replaceMembers(
    tenantId: string,
    members: AppMember[],
    options: { notify?: boolean } = {}
  ) {
    const updatedAt = new Date().toISOString();
    await withExclusiveWrite(async (tx) => {
      await tx.runAsync("DELETE FROM admin_members WHERE tenant_id = ?", [tenantId]);
      for (const member of members) {
        await tx.runAsync(
          `INSERT INTO admin_members (
            id,
            tenant_id,
            name,
            role,
            login_code,
            photo_url,
            photo_path,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            member.id,
            member.tenantId,
            member.name,
            member.role,
            member.loginCode,
            member.photoUrl ?? null,
            member.photoPath ?? null,
            updatedAt,
          ]
        );
      }
    });

    if (options.notify !== false) emit();
  },

  async replaceSessionUserNames(
    tenantId: string,
    sessionUserNames: Record<string, string>,
    options: { notify?: boolean } = {}
  ) {
    const updatedAt = new Date().toISOString();
    await withExclusiveWrite(async (tx) => {
      await tx.runAsync("DELETE FROM admin_session_users WHERE tenant_id = ?", [
        tenantId,
      ]);
      for (const [userId, name] of Object.entries(sessionUserNames)) {
        await tx.runAsync(
          `INSERT INTO admin_session_users (
            user_id,
            tenant_id,
            name,
            updated_at
          ) VALUES (?, ?, ?, ?)`,
          [userId, tenantId, name, updatedAt]
        );
      }
    });

    if (options.notify !== false) emit();
  },

  async replacePendingDevices(
    tenantId: string,
    devices: Device[],
    options: { notify?: boolean } = {}
  ) {
    const updatedAt = new Date().toISOString();
    await withExclusiveWrite(async (tx) => {
      await tx.runAsync("DELETE FROM admin_pending_devices WHERE tenant_id = ?", [
        tenantId,
      ]);
      for (const device of devices) {
        await tx.runAsync(
          `INSERT INTO admin_pending_devices (
            id,
            tenant_id,
            user_id,
            approved,
            push_token,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            device.id,
            device.tenantId,
            device.userId,
            device.approved ? 1 : 0,
            device.pushToken,
            device.createdAt.toISOString(),
            updatedAt,
          ]
        );
      }
    });

    if (options.notify !== false) emit();
  },
};
