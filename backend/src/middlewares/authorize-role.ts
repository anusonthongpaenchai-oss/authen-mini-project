import type { RequestHandler } from "express";
import { ApiError, unauthorized } from "../services/auth.js";
import type { Role } from "../services/auth.js";

/** Must follow authenticate: only its database-backed context is trusted. */
export function authorizeRole(role: Role): RequestHandler {
  return (_req, res, next) => {
    if (!res.locals.auth) return next(unauthorized());
    if (res.locals.auth.user.role !== role) {
      return next(
        new ApiError(403, "FORBIDDEN", "คุณไม่มีสิทธิ์เข้าถึงส่วนนี้"),
      );
    }
    next();
  };
}
