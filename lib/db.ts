import * as SQLite from "expo-sqlite";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

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
      firebase_uid TEXT PRIMARY KEY,
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

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
      ON messages (conversation_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_messages_status
      ON messages (status);

    CREATE INDEX IF NOT EXISTS idx_chats_last_message_at
      ON chats (last_message_at);
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
  await ensureColumn(db, "chats", "read_up_to", "TEXT");
  await ensureColumn(db, "app_sessions", "photo_url", "TEXT");
  await ensureColumn(db, "app_sessions", "photo_path", "TEXT");
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
