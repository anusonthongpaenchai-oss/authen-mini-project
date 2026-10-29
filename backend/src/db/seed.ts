import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import { openDatabase } from "./connection.js";

export async function seedUser(database: Database.Database) {
  const hash = await bcrypt.hash("moodeng123", 12);
  database
    .prepare(
      `INSERT INTO users (id, email, name, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, 'user', ?) ON CONFLICT(email) DO NOTHING`,
    )
    .run(randomUUID(), "moodeng@gmail.com", "Moodeng", hash, Date.now());
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const database = openDatabase();
  try {
    await seedUser(database);
    console.log(
      "User seed ready: moodeng@gmail.com (existing accounts are preserved)",
    );
  } finally {
    database.close();
  }
}
