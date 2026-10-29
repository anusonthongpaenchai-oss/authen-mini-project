export interface AuthConfig {
  port: number;
  frontendOrigin: string;
  jwtSecret: string;
  accessTokenSeconds: number;
  refreshSessionSeconds: number;
  cookieSecure: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const integer = (key: string, fallback: number) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error(`${key} must be a positive integer`);
    return value;
  };
  const jwtSecret = env.JWT_SECRET ?? "";
  if (jwtSecret.length < 32)
    throw new Error("JWT_SECRET must contain at least 32 characters");
  if (jwtSecret.startsWith("replace-with-"))
    throw new Error(
      "Replace the example JWT_SECRET with your own random secret",
    );
  const origin = new URL(env.FRONTEND_ORIGIN ?? "http://localhost:4200");
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.origin !== (env.FRONTEND_ORIGIN ?? "http://localhost:4200")
  ) {
    throw new Error(
      "FRONTEND_ORIGIN must be an HTTP(S) origin without a trailing slash",
    );
  }
  if (
    env.COOKIE_SECURE !== undefined &&
    !["true", "false"].includes(env.COOKIE_SECURE)
  ) {
    throw new Error("COOKIE_SECURE must be true or false");
  }
  const cookieSecure =
    env.COOKIE_SECURE === "true" || origin.protocol === "https:";
  if (env.NODE_ENV === "production" && !cookieSecure)
    throw new Error("Production requires HTTPS and secure cookies");
  const port = integer("PORT", 3000);
  if (port > 65535) throw new Error("PORT must be <= 65535");
  return {
    port,
    frontendOrigin: origin.origin,
    jwtSecret,
    cookieSecure,
    accessTokenSeconds: integer("ACCESS_TOKEN_SECONDS", 300),
    refreshSessionSeconds: integer("REFRESH_SESSION_SECONDS", 604800),
  };
}
