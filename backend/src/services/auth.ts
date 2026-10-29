import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import jwt from "jsonwebtoken";
import type Database from "better-sqlite3";
import type { AuthConfig } from "../config.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export type Role = "user" | "admin";
export const isRole = (value: unknown): value is Role =>
  value === "user" || value === "admin";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  password_hash: string;
}
export interface SessionRow {
  id: string;
  user_id: string;
  remember_me: number;
  refresh_token_hash: string | null;
  expires_at: number;
  revoked_at: number | null;
}
export const unauthorized = () =>
  new ApiError(
    401,
    "SESSION_EXPIRED",
    "Session หมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่",
  );
export const publicUser = (user: UserRow) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
});
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export class AuthService {
  constructor(
    public database: Database.Database,
    public config: AuthConfig,
  ) {}

  user(id: string) {
    return this.database.prepare("SELECT * FROM users WHERE id = ?").get(id) as
      UserRow | undefined;
  }
  session(id: string) {
    return this.database
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(id) as SessionRow | undefined;
  }
  requireAccount(user: UserRow | undefined): UserRow {
    if (!user) throw unauthorized();
    if (!isRole(user.role)) throw unauthorized();
    return user;
  }
  revoke(id: string) {
    this.database
      .prepare(
        "UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?",
      )
      .run(Date.now(), id);
  }
  access(token: string, allowExpired = false) {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret, {
        algorithms: ["HS256"],
        issuer: "authen-mini-project",
        audience: "user-app",
        ignoreExpiration: allowExpired,
      });
      if (
        typeof payload === "string" ||
        typeof payload.sub !== "string" ||
        typeof payload.sid !== "string" ||
        typeof payload.exp !== "number"
      )
        throw unauthorized();
      const session = this.session(payload.sid);
      if (!session || session.user_id !== payload.sub) throw unauthorized();
      if (
        !allowExpired &&
        (session.revoked_at !== null || session.expires_at <= Date.now())
      )
        throw unauthorized();
      const user = this.user(payload.sub);
      if (!user) throw unauthorized();
      // Logout identifies and revokes the signed session even if its user's role changed.
      return { session, user: allowExpired ? user : this.requireAccount(user) };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw unauthorized();
    }
  }
  refreshSession(token: unknown, allowExpired = false) {
    if (typeof token !== "string" || token.length > 256) throw unauthorized();
    const id = token.split(".")[0];
    const session = id ? this.session(id) : undefined;
    if (!session || !session.remember_me || !session.refresh_token_hash)
      throw unauthorized();
    const expected = Buffer.from(session.refresh_token_hash, "hex");
    const actual = Buffer.from(hash(token), "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      throw unauthorized();
    if (
      !allowExpired &&
      (session.revoked_at !== null || session.expires_at <= Date.now())
    )
      throw unauthorized();
    return session;
  }
  refreshToken(id: string) {
    return `${id}.${randomBytes(32).toString("hex")}`;
  }
  create(user: UserRow, rememberMe: boolean) {
    const id = randomUUID();
    const refreshToken = rememberMe ? this.refreshToken(id) : null;
    const now = Date.now();
    const expiresAt =
      now +
      (rememberMe
        ? this.config.refreshSessionSeconds
        : this.config.accessTokenSeconds) *
        1000;
    this.database
      .prepare(
        `INSERT INTO sessions
      (id, user_id, remember_me, refresh_token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        user.id,
        Number(rememberMe),
        refreshToken ? hash(refreshToken) : null,
        expiresAt,
        now,
      );
    return { session: this.session(id)!, refreshToken };
  }
  response(user: UserRow, session: SessionRow) {
    const now = Math.floor(Date.now() / 1000);
    const exp = Math.min(
      now + this.config.accessTokenSeconds,
      Math.floor(session.expires_at / 1000),
    );
    if (exp <= now) throw unauthorized();
    const accessToken = jwt.sign(
      { sub: user.id, sid: session.id, iat: now, exp },
      this.config.jwtSecret,
      {
        algorithm: "HS256",
        issuer: "authen-mini-project",
        audience: "user-app",
      },
    );
    return {
      accessToken,
      expiresAt: exp * 1000,
      rememberMe: Boolean(session.remember_me),
      user: publicUser(user),
    };
  }
  rotate(token: unknown) {
    return this.database.transaction(() => {
      const session = this.refreshSession(token);
      const user = this.requireAccount(this.user(session.user_id));
      const refreshToken = this.refreshToken(session.id);
      this.database
        .prepare("UPDATE sessions SET refresh_token_hash = ? WHERE id = ?")
        .run(hash(refreshToken), session.id);
      return { session, refreshToken, response: this.response(user, session) };
    })();
  }
}
