import { Router } from "express";
import type { CookieOptions } from "express";
import bcrypt from "bcrypt";
import { ApiError, AuthService, publicUser } from "../services/auth.js";
import { authorizeUser } from "../middlewares/authorize-user.js";

const COOKIE = "user_refresh";
// Used for unknown emails too, so both failure paths perform a bcrypt comparison.
const dummyHash = bcrypt.hashSync("not-a-real-account", 12);

export function createAuthRouter(auth: AuthService) {
  const router = Router();
  const cookie: CookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: auth.config.cookieSecure,
    path: "/api/auth",
  };
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use((req, _res, next) => {
    if (
      req.method === "POST" &&
      req.get("origin") !== auth.config.frontendOrigin
    ) {
      return next(
        new ApiError(403, "INVALID_ORIGIN", "Origin ไม่ได้รับอนุญาต"),
      );
    }
    next();
  });
  router.post("/login", async (req, res) => {
    const { email, password, rememberMe } = req.body ?? {};
    if (
      typeof email !== "string" ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== "string" ||
      password.length < 1 ||
      Buffer.byteLength(password) > 72 ||
      typeof rememberMe !== "boolean"
    ) {
      throw new ApiError(
        400,
        "INVALID_INPUT",
        "กรุณาระบุ Email, Password และ Remember Me ให้ถูกต้อง",
      );
    }
    const user = auth.database
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email.trim().toLowerCase()) as
      import("../services/auth.js").UserRow | undefined;
    const matches = await bcrypt.compare(
      password,
      user?.password_hash ?? dummyHash,
    );
    if (!user || !matches || user.role !== "user")
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "Email หรือ Password ไม่ถูกต้อง",
      );
    const { session, refreshToken } = auth.database.transaction(() => {
      try {
        auth.revoke(auth.refreshSession(req.cookies[COOKIE], true).id);
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
      }
      return auth.create(user, rememberMe);
    })();
    if (refreshToken)
      res.cookie(COOKIE, refreshToken, {
        ...cookie,
        expires: new Date(session.expires_at),
      });
    else res.clearCookie(COOKIE, cookie);
    res.json(auth.response(user, session));
  });
  router.post("/refresh", (req, res) => {
    try {
      const result = auth.rotate(req.cookies[COOKIE]);
      res.cookie(COOKIE, result.refreshToken, {
        ...cookie,
        expires: new Date(result.session.expires_at),
      });
      res.json(result.response);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        res.clearCookie(COOKIE, cookie);
      throw error;
    }
  });
  router.post("/logout", (req, res) => {
    // Accept an expired, correctly signed access token so temporary sessions can also be revoked.
    const token = /^Bearer (\S+)$/.exec(req.get("authorization") ?? "")?.[1];
    if (token) {
      try {
        auth.revoke(auth.access(token, true).session.id);
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
      }
    }
    try {
      auth.revoke(auth.refreshSession(req.cookies[COOKIE], true).id);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
    }
    res.clearCookie(COOKIE, cookie);
    // Idempotent: absence of valid credentials means there is no authenticated session to retain.
    res.status(204).end();
  });
  router.get("/me", authorizeUser(auth), (_req, res) =>
    res.json(publicUser(res.locals.auth.user)),
  );
  return router;
}
