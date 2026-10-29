import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Source and compiled entrypoints share the existing src/db directory.
export const defaultDatabasePath = fileURLToPath(
  new URL("../../src/db/auth.sqlite", import.meta.url),
);
const schemaPath = fileURLToPath(
  new URL("../../src/db/schema.sql", import.meta.url),
);

/** Open an initialized connection. The caller is responsible for closing it. */
export function openDatabase(
  databasePath: string = defaultDatabasePath,
): Database.Database {
  const schema = readFileSync(schemaPath, "utf8");
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = new Database(databasePath);

  try {
    // Foreign key enforcement is configured separately for every connection.
    database.pragma("foreign_keys = ON");
    database.transaction(() => database.exec(schema))();
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
