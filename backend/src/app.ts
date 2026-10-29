import express from "express";
import cors from "cors";
import type Database from "better-sqlite3";
import { createHealthCheckRouter } from "./routes/health-check.js";
import cookieParser from "cookie-parser";
import type { ErrorRequestHandler } from "express";
import type { AuthConfig } from "./config.js";
import { ApiError, AuthService, publicUser } from "./services/auth.js";
import { createAuthRouter } from "./routes/auth.js";
import { authorizeUser } from "./middlewares/authorize-user.js";

export function createApp(database: Database.Database, config: AuthConfig) {
  const app = express();

  app.use(
    cors({
      origin: config.frontendOrigin,
      credentials: true,
    }),
  );
  app.disable("x-powered-by");
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());

  app.use("/api/health", createHealthCheckRouter(database));
  const auth = new AuthService(database, config);
  app.use("/api/auth", createAuthRouter(auth));
  app.get("/api/user/dashboard", authorizeUser(auth), (_req, res) => {
    res
      .set("Cache-Control", "no-store")
      .json({
        user: publicUser(res.locals.auth.user),
        message: "คุณสามารถเข้าถึงข้อมูลส่วนตัวของคุณได้",
      });
  });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ApiError) {
      res
        .status(error.status)
        .json({ code: error.code, message: error.message });
      return;
    }
    if (
      error?.type === "entity.parse.failed" ||
      error?.type === "entity.too.large"
    ) {
      res
        .status(400)
        .json({
          code: "INVALID_INPUT",
          message: "รูปแบบข้อมูลไม่ถูกต้องหรือมีขนาดใหญ่เกินไป",
        });
      return;
    }
    console.error("Request failed", error);
    res
      .status(500)
      .json({ code: "INTERNAL_ERROR", message: "ระบบขัดข้อง กรุณาลองใหม่" });
  };
  app.use(errors);

  return app;
}
