import "dotenv/config";
import { createApp } from "./app.js";
import { openDatabase } from "./db/connection.js";

const PORT = process.env.PORT || 3000;
const database = openDatabase();
const app = createApp(database);

const server = app.listen(PORT, () => {
  console.log("SQLite database connected");
  console.log(`Server running at http://localhost:${PORT}`);
});

server.once("close", () => {
  if (database.open) database.close();
});

server.once("error", (error) => {
  if (database.open) database.close();
  console.error("Failed to start server:", error);
  process.exitCode = 1;
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
