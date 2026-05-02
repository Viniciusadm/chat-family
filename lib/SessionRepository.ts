import { getDatabase } from "@/lib/db";
import type { AppUser } from "@/types/chat";

type SessionRow = {
  firebase_uid: string;
  member_id: string;
  tenant_id: string;
  name: string;
  role: string;
  device_approved: number | null;
};

export type LocalSession = {
  firebaseUid: string;
  currentUser: AppUser;
  deviceApproved: boolean | null;
};

function rowToSession(row: SessionRow): LocalSession {
  return {
    firebaseUid: row.firebase_uid,
    currentUser: {
      id: row.member_id,
      tenantId: row.tenant_id,
      name: row.name,
      role: row.role === "child" ? "child" : "adult",
    },
    deviceApproved:
      row.device_approved == null ? null : row.device_approved === 1,
  };
}

export const SessionRepository = {
  async getSession(firebaseUid: string): Promise<LocalSession | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SessionRow>(
      `SELECT *
       FROM app_sessions
       WHERE firebase_uid = ?`,
      [firebaseUid]
    );

    return row ? rowToSession(row) : null;
  },

  async getLastApprovedSession(): Promise<LocalSession | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SessionRow>(
      `SELECT *
       FROM app_sessions
       WHERE device_approved = 1
       ORDER BY updated_at DESC
       LIMIT 1`
    );

    return row ? rowToSession(row) : null;
  },

  async saveSession({
    firebaseUid,
    currentUser,
    deviceApproved,
  }: {
    firebaseUid: string;
    currentUser: AppUser;
    deviceApproved: boolean | null;
  }) {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO app_sessions (
        firebase_uid,
        member_id,
        tenant_id,
        name,
        role,
        device_approved,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        firebaseUid,
        currentUser.id,
        currentUser.tenantId,
        currentUser.name,
        currentUser.role,
        deviceApproved == null ? null : deviceApproved ? 1 : 0,
        new Date().toISOString(),
      ]
    );
  },

  async updateDeviceApproved(
    firebaseUid: string,
    deviceApproved: boolean | null
  ) {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE app_sessions
       SET device_approved = ?, updated_at = ?
       WHERE firebase_uid = ?`,
      [
        deviceApproved == null ? null : deviceApproved ? 1 : 0,
        new Date().toISOString(),
        firebaseUid,
      ]
    );
  },
};
