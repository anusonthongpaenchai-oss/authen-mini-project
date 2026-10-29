import { Router } from "express";
import type Database from "better-sqlite3";

export function createHealthCheckRouter(database: Database.Database) {
  const router = Router();

  router.get("/", (_req, res) => {
    let connected = true;

    try {
      database.prepare("SELECT 1").get();
    } catch (error) {
      connected = false;
      console.error("Database health check failed:", error);
    }

    res.status(connected ? 200 : 503).json({
      status: connected ? "ok" : "error",
      message: connected
        ? "Backend service is running smoothly"
        : "Database connection is unavailable",
      database: connected ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || "development",
    });
  });

  return router;
}
