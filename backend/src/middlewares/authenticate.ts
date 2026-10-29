import type { RequestHandler } from "express";
import type { AuthService } from "../services/auth.js";
import { unauthorized } from "../services/auth.js";

/** Authenticate each request using the current session and user in the database. */
export function authenticate(auth: AuthService): RequestHandler {
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
