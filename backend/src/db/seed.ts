import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import { openDatabase } from "./connection.js";
import type { Role } from "../services/auth.js";

async function seedAccount(
  database: Database.Database,
  account: {
    email: string;
    password: string;
    name: string;
    role: Role;
  },
) {
  const hash = await bcrypt.hash(account.password, 12);
  database
    .prepare(
      `INSERT INTO users (id, email, name, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING`,
    )
    .run(
      randomUUID(),
      account.email,
      account.name,
      hash,
      account.role,
      Date.now(),
    );
}

export async function seedUser(database: Database.Database) {
  await seedAccount(database, {
    email: "moodeng@gmail.com",
    password: "moodeng123",
    name: "Moodeng",
    role: "user",
  });
}

export async function seedAdmin(database: Database.Database) {
  await seedAccount(database, {
    email: "admin@gmail.com",
    password: "admin123",
    name: "Admin",
    role: "admin",
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const database = openDatabase();
  try {
    await seedUser(database);
    await seedAdmin(database);
    console.log(
      "Accounts ready: moodeng@gmail.com (user), admin@gmail.com (admin); existing accounts are preserved",
    );
  } finally {
    database.close();
  }
}
