import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultDatabasePath, openDatabase } from "./connection.js";

/** Create missing tables without modifying existing records. */
export function initializeDatabase(
  databasePath: string = defaultDatabasePath,
): void {
  openDatabase(databasePath).close();
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    initializeDatabase();
    console.log(`SQLite database initialized at ${defaultDatabasePath}`);
  } catch (error) {
    console.error("Failed to initialize SQLite database:", error);
    process.exitCode = 1;
  }
}
