import * as SQLite from "expo-sqlite";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function ensureColumn(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  columnName: string,
  definition: string
) {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  if (rows.some((row) => row.name === columnName)) return;
  await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
}

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      sender_id TEXT,
      body TEXT,
      type TEXT,
      status TEXT,
      created_at TEXT,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      participants TEXT NOT NULL,
      is_group INTEGER NOT NULL,
      name TEXT NOT NULL,
      unread_count INTEGER NOT NULL DEFAULT 0,
      last_message_text TEXT,
      last_message_type TEXT,
      last_message_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS app_sessions (
      auth_user_id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      device_approved INTEGER,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_message_sync (
      chat_id TEXT PRIMARY KEY,
      history_synced_at TEXT,
      newest_message_at TEXT
    );

    CREATE TABLE IF NOT EXISTS admin_members (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      login_code TEXT,
      photo_url TEXT,
      photo_path TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_session_users (
      user_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_pending_devices (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      member_id TEXT,
      approved INTEGER NOT NULL,
      push_token TEXT NOT NULL,
      public_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
      ON messages (conversation_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_messages_status
      ON messages (status);

    CREATE INDEX IF NOT EXISTS idx_chats_last_message_at
      ON chats (last_message_at);

    CREATE INDEX IF NOT EXISTS idx_admin_members_tenant
      ON admin_members (tenant_id);

    CREATE INDEX IF NOT EXISTS idx_admin_session_users_tenant
      ON admin_session_users (tenant_id);

    CREATE INDEX IF NOT EXISTS idx_admin_pending_devices_tenant
      ON admin_pending_devices (tenant_id);
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS message_reactions (
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent',
      PRIMARY KEY (message_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reactions_message_id
      ON message_reactions (message_id);
  `);

  await ensureColumn(db, "messages", "local_audio_uri", "TEXT");
  await ensureColumn(db, "messages", "audio_downloaded_at", "TEXT");
  await ensureColumn(db, "messages", "audio_duration", "REAL");
  await ensureColumn(db, "messages", "reply_to_message_id", "TEXT");
  await ensureColumn(db, "messages", "reply_to_sender_id", "TEXT");
  await ensureColumn(db, "messages", "reply_to_sender_name", "TEXT");
  await ensureColumn(db, "messages", "reply_to_type", "TEXT");
  await ensureColumn(db, "messages", "reply_to_preview", "TEXT");
  await ensureColumn(db, "chats", "read_up_to", "TEXT");
  await ensureColumn(db, "chats", "photo_url", "TEXT");
  await ensureColumn(db, "chats", "photo_path", "TEXT");
  await ensureColumn(db, "app_sessions", "auth_user_id", "TEXT");
  await ensureColumn(db, "app_sessions", "photo_url", "TEXT");
  await ensureColumn(db, "app_sessions", "photo_path", "TEXT");
  await ensureColumn(db, "messages", "image_remote_url", "TEXT");
  await ensureColumn(db, "messages", "image_thumbnail_url", "TEXT");
  await ensureColumn(db, "messages", "local_image_uri", "TEXT");
  await ensureColumn(db, "messages", "local_thumbnail_uri", "TEXT");
  await ensureColumn(db, "messages", "image_width", "REAL");
  await ensureColumn(db, "messages", "image_height", "REAL");
  await ensureColumn(db, "messages", "image_file_size", "REAL");
  await ensureColumn(db, "messages", "image_pending_source_uri", "TEXT");
  await ensureColumn(db, "messages", "image_downloaded_at", "TEXT");
  await ensureColumn(db, "messages", "is_edited", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(db, "messages", "edited_at", "TEXT");
  await ensureColumn(db, "messages", "is_deleted", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(db, "messages", "deleted_at", "TEXT");
  await ensureColumn(db, "messages", "pending_op", "TEXT");
  await ensureColumn(db, "messages", "original_body", "TEXT");
  await ensureColumn(db, "messages", "updated_at", "TEXT");
  await ensureColumn(db, "messages", "edit_attempts", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(db, "messages", "ciphertext", "TEXT");
  await ensureColumn(db, "messages", "iv", "TEXT");
  await ensureColumn(db, "messages", "enc_version", "INTEGER");
  await ensureColumn(db, "admin_pending_devices", "member_id", "TEXT");
  await ensureColumn(db, "admin_pending_devices", "public_key", "TEXT");

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_messages_pending_op
      ON messages (pending_op);
  `);
}

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync("chat.db").then(async (db) => {
      await migrate(db);
      return db;
    });
  }

  return databasePromise;
}

export async function withExclusiveWrite<T>(
  task: (db: SQLite.SQLiteDatabase) => Promise<T>
): Promise<T> {
  let result!: T;
  const run = async () => {
    const db = await getDatabase();
    await db.withExclusiveTransactionAsync(async (tx) => {
      result = await task(tx);
    });
    return result;
  };

  const next = writeQueue.then(run, run);
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );

  return next;
}
