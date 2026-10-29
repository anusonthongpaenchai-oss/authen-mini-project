import express from "express";
import cors from "cors";
import type Database from "better-sqlite3";
import { createHealthCheckRouter } from "./routes/health-check.js";

export function createApp(database: Database.Database) {
  const app = express();

  app.use(
    cors({
      origin: ["http://localhost:4200", "http://127.0.0.1:4200"],
      credentials: true,
    }),
  );
  app.use(express.json());

  app.use("/api/health", createHealthCheckRouter(database));

  return app;
}
