import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db/connection.js";
import { seedUser } from "../src/db/seed.js";
import { loadConfig } from "../src/config.js";
import type { AuthConfig } from "../src/config.js";

const config: AuthConfig = {
  port: 3000,
  frontendOrigin: "http://localhost:4200",
  jwtSecret: "test-secret-with-more-than-thirty-two-characters",
  accessTokenSeconds: 300,
  refreshSessionSeconds: 600,
  cookieSecure: false,
};
const database = openDatabase(":memory:");
const server = createApp(database, config).listen(0, "127.0.0.1");
let base: string;
before(async () => {
  if (!server.listening) await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  await seedUser(database);
});
after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  database.close();
});

async function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    cookie?: string;
    origin?: string;
  } = {},
) {
  const headers: Record<string, string> = {
    Origin: options.origin ?? config.frontendOrigin,
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.cookie) headers.Cookie = options.cookie;
  return fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
}
async function login(rememberMe = false, cookie?: string) {
  const response = await request("/auth/login", {
    method: "POST",
    body: { email: "moodeng@gmail.com", password: "moodeng123", rememberMe },
    ...(cookie ? { cookie } : {}),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    accessToken: string;
    expiresAt: number;
    rememberMe: boolean;
    user: { id: string; name: string; role: string };
  };
  return {
    body,
    cookie: response.headers.get("set-cookie")!.split(";")[0]!,
    response,
  };
}
const sessionId = (token: string) =>
  (jwt.decode(token) as jwt.JwtPayload).sid as string;

test("configuration rejects missing secrets and invalid TTL/origin/production cookies", () => {
  assert.throws(() => loadConfig({}), /JWT_SECRET/);
  assert.throws(
    () =>
      loadConfig({ JWT_SECRET: config.jwtSecret, ACCESS_TOKEN_SECONDS: "0" }),
    /ACCESS_TOKEN_SECONDS/,
  );
  assert.throws(
    () =>
      loadConfig({
        JWT_SECRET: config.jwtSecret,
        FRONTEND_ORIGIN: "http://localhost:4200/path",
      }),
    /FRONTEND_ORIGIN/,
  );
  assert.throws(
    () => loadConfig({ JWT_SECRET: config.jwtSecret, NODE_ENV: "production" }),
    /secure cookies/,
  );
  assert.equal(
    loadConfig({
      JWT_SECRET: config.jwtSecret,
      FRONTEND_ORIGIN: "https://example.com",
    }).cookieSecure,
    true,
  );
});

test("seed is repeatable and persists only a bcrypt password hash", async () => {
  await seedUser(database);
  const rows = database
    .prepare("SELECT * FROM users WHERE email = ?")
    .all("moodeng@gmail.com") as { password_hash: string; role: string }[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.role, "user");
  assert.notEqual(rows[0]!.password_hash, "moodeng123");
  assert.equal(
    await bcrypt.compare("moodeng123", rows[0]!.password_hash),
    true,
  );
});

test("login exposes only public User data and access credentials", async () => {
  const { body, response } = await login();
  assert.equal(body.user.name, "Moodeng");
  assert.equal(body.user.role, "user");
  assert.equal(body.rememberMe, false);
  assert.equal("password_hash" in body.user, false);
  assert.equal("refreshToken" in body, false);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const session = database
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(sessionId(body.accessToken)) as { refresh_token_hash: unknown };
  assert.equal(session.refresh_token_hash, null);
  const me = await request("/auth/me", { token: body.accessToken });
  assert.equal(me.status, 200);
  assert.equal(
    ((await me.json()) as { email: string }).email,
    "moodeng@gmail.com",
  );
  const dashboard = await request("/user/dashboard", {
    token: body.accessToken,
  });
  assert.equal(dashboard.status, 200);
  assert.equal(
    ((await dashboard.json()) as { message: string }).message,
    "คุณสามารถเข้าถึงข้อมูลส่วนตัวของคุณได้",
  );
});

test("invalid input returns 400; incorrect email and password share one error", async () => {
  const bad = await request("/auth/login", {
    method: "POST",
    body: { email: "bad" },
  });
  assert.equal(bad.status, 400);
  const a = await request("/auth/login", {
    method: "POST",
    body: {
      email: "missing@example.com",
      password: "wrong",
      rememberMe: false,
    },
  });
  const b = await request("/auth/login", {
    method: "POST",
    body: { email: "moodeng@gmail.com", password: "wrong", rememberMe: false },
  });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.deepEqual(await a.json(), await b.json());
});

test("absent, forged and expired access tokens return 401", async () => {
  assert.equal((await request("/user/dashboard")).status, 401);
  assert.equal(
    (await request("/user/dashboard", { token: "forged" })).status,
    401,
  );
  const { body } = await login();
  const expired = jwt.sign(
    {
      sub: body.user.id,
      sid: sessionId(body.accessToken),
      exp: Math.floor(Date.now() / 1000) - 1,
    },
    config.jwtSecret,
    { issuer: "authen-mini-project", audience: "user-app" },
  );
  assert.equal(
    (await request("/user/dashboard", { token: expired })).status,
    401,
  );
  database
    .prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
    .run(Date.now() - 1, sessionId(body.accessToken));
  assert.equal(
    (await request("/user/dashboard", { token: body.accessToken })).status,
    401,
  );
});

test("temporary login cannot refresh", async () => {
  await login(false);
  assert.equal(
    (await request("/auth/refresh", { method: "POST" })).status,
    401,
  );
});

test("remembered login uses a persistent HttpOnly cookie and a hashed refresh token", async () => {
  const { body, cookie, response } = await login(true);
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
  assert.match(response.headers.get("set-cookie")!, /SameSite=Lax/);
  assert.match(response.headers.get("set-cookie")!, /Expires=/);
  assert.match(response.headers.get("set-cookie")!, /Path=\/api\/auth/);
  const session = database
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(sessionId(body.accessToken)) as { refresh_token_hash: string };
  assert.equal(session.refresh_token_hash.length, 64);
  assert.notEqual(session.refresh_token_hash, cookie.split("=")[1]);
});

test("refresh rotates tokens without extending the absolute session and rejects replay", async () => {
  const { body, cookie } = await login(true);
  const original = database
    .prepare("SELECT expires_at FROM sessions WHERE id = ?")
    .get(sessionId(body.accessToken));
  const response = await request("/auth/refresh", { method: "POST", cookie });
  assert.equal(response.status, 200);
  const rotatedCookie = response.headers.get("set-cookie")!.split(";")[0]!;
  assert.notEqual(rotatedCookie, cookie);
  const renewed = (await response.json()) as { accessToken: string };
  assert.equal(
    (await request("/auth/me", { token: renewed.accessToken })).status,
    200,
  );
  assert.deepEqual(
    database
      .prepare("SELECT expires_at FROM sessions WHERE id = ?")
      .get(sessionId(body.accessToken)),
    original,
  );
  assert.equal(
    (await request("/auth/refresh", { method: "POST", cookie })).status,
    401,
  );
  assert.equal(
    (await request("/auth/refresh", { method: "POST", cookie: rotatedCookie }))
      .status,
    200,
  );
});

test("refresh works after access-token expiry but not after refresh-session expiry or revocation", async () => {
  const remembered = await login(true);
  const expired = jwt.sign(
    {
      sub: remembered.body.user.id,
      sid: sessionId(remembered.body.accessToken),
      exp: 1,
    },
    config.jwtSecret,
    { issuer: "authen-mini-project", audience: "user-app" },
  );
  assert.equal((await request("/auth/me", { token: expired })).status, 401);
  assert.equal(
    (
      await request("/auth/refresh", {
        method: "POST",
        cookie: remembered.cookie,
      })
    ).status,
    200,
  );
  const expiredSession = await login(true);
  database
    .prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
    .run(Date.now() - 1, sessionId(expiredSession.body.accessToken));
  assert.equal(
    (
      await request("/auth/refresh", {
        method: "POST",
        cookie: expiredSession.cookie,
      })
    ).status,
    401,
  );
  const revoked = await login(true);
  database
    .prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?")
    .run(Date.now(), sessionId(revoked.body.accessToken));
  assert.equal(
    (await request("/auth/refresh", { method: "POST", cookie: revoked.cookie }))
      .status,
    401,
  );
  assert.equal(
    (
      await request("/auth/refresh", {
        method: "POST",
        cookie: "user_refresh=invalid.token",
      })
    ).status,
    401,
  );
});

test("concurrent use of the same refresh token succeeds exactly once", async () => {
  const { cookie } = await login(true);
  const responses = await Promise.all(
    [1, 2].map(() => request("/auth/refresh", { method: "POST", cookie })),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 401]);
});

test("logout immediately rejects previous access and refresh tokens", async () => {
  const { body, cookie } = await login(true);
  assert.equal(
    (
      await request("/auth/logout", {
        method: "POST",
        token: body.accessToken,
        cookie,
      })
    ).status,
    204,
  );
  assert.equal(
    (await request("/auth/me", { token: body.accessToken })).status,
    401,
  );
  assert.equal(
    (await request("/auth/refresh", { method: "POST", cookie })).status,
    401,
  );
});

test("logout can revoke through refresh cookie or an expired signed access token", async () => {
  const remembered = await login(true);
  assert.equal(
    (
      await request("/auth/logout", {
        method: "POST",
        cookie: remembered.cookie,
      })
    ).status,
    204,
  );
  assert.equal(
    (await request("/auth/me", { token: remembered.body.accessToken })).status,
    401,
  );
  const temporary = await login(false);
  const expired = jwt.sign(
    {
      sub: temporary.body.user.id,
      sid: sessionId(temporary.body.accessToken),
      exp: 1,
    },
    config.jwtSecret,
    { issuer: "authen-mini-project", audience: "user-app" },
  );
  assert.equal(
    (await request("/auth/logout", { method: "POST", token: expired })).status,
    204,
  );
  assert.equal(
    (await request("/auth/me", { token: temporary.body.accessToken })).status,
    401,
  );
});

test("temporary login clears the old refresh cookie and revokes its remembered session", async () => {
  const old = await login(true);
  const temporary = await login(false, old.cookie);
  assert.match(
    temporary.response.headers.get("set-cookie")!,
    /Expires=Thu, 01 Jan 1970/,
  );
  assert.equal(
    (await request("/auth/refresh", { method: "POST", cookie: old.cookie }))
      .status,
    401,
  );
  assert.equal(
    (await request("/auth/me", { token: old.body.accessToken })).status,
    401,
  );
});

test("role is checked from the database, not a frontend or JWT claim", async () => {
  const { body } = await login();
  const user = database
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(body.user.id) as { password_hash: string };
  database
    .prepare(
      "INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      "role-fixture",
      "fixture@example.com",
      "Test only",
      user.password_hash,
      "admin",
      Date.now(),
    );
  database
    .prepare(
      "INSERT INTO sessions (id, user_id, remember_me, expires_at, created_at) VALUES (?, ?, 0, ?, ?)",
    )
    .run("fixture-session", "role-fixture", Date.now() + 60000, Date.now());
  const token = jwt.sign(
    { sub: "role-fixture", sid: "fixture-session", role: "user" },
    config.jwtSecret,
    { expiresIn: 60, issuer: "authen-mini-project", audience: "user-app" },
  );
  assert.equal((await request("/user/dashboard", { token })).status, 403);
  database.prepare("DELETE FROM sessions WHERE id = ?").run("fixture-session");
  database.prepare("DELETE FROM users WHERE id = ?").run("role-fixture");
});

test("cookie-auth mutations reject untrusted or missing Origin", async () => {
  const bad = await request("/auth/refresh", {
    method: "POST",
    origin: "https://evil.example",
  });
  assert.equal(bad.status, 403);
  const absent = await fetch(`${base}/auth/logout`, { method: "POST" });
  assert.equal(absent.status, 403);
});
