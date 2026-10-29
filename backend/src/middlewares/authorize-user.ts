import type { RequestHandler } from "express";
import type { AuthService } from "../services/auth.js";
import { unauthorized } from "../services/auth.js";

/** This feature intentionally authorizes only User; no general role middleware. */
export function authorizeUser(auth: AuthService): RequestHandler {
  return (req, res, next) => {
    try {
      const match = /^Bearer (\S+)$/.exec(req.get("authorization") ?? "");
      if (!match?.[1]) throw unauthorized();
      res.locals.auth = auth.access(match[1]);
      next();
    } catch (error) {
      next(error);
    }
  };
}
