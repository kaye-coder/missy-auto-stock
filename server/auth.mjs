import { newId, newSecret, nowIso, sha256 } from "./db.mjs";

const MODULES = [
  "pos",
  "inventory",
  "categories",
  "customers",
  "suppliers",
  "sales",
  "purchases",
  "expenses",
  "accounting",
  "reconciliation",
  "statistics",
  "settings",
  "users",
];

const normalizeRole = (role) =>
  role === "admin" || role === "cashier" || role === "custom" ? role : "cashier";

function parsePermissions(value) {
  try {
    const list = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(list) ? list.filter((m) => MODULES.includes(m)) : [];
  } catch {
    return [];
  }
}

function mapUser(row) {
  const role = normalizeRole(row.role);
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role,
    permissions: role === "admin" ? [...MODULES] : parsePermissions(row.permissions),
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}

function mapSession(row, loggedInAt) {
  const user = mapUser(row);
  return {
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    permissions: user.permissions,
    loggedInAt,
  };
}

const hashPassword = (password, salt) => sha256(`${salt}:${password}`);

function findByUsername(db, username) {
  return db
    .prepare("SELECT * FROM app_users WHERE lower(username) = lower(?) LIMIT 1")
    .get(String(username).trim());
}

function createSession(db, user) {
  const token = newSecret();
  const createdAt = nowIso();
  db.prepare(
    "INSERT INTO app_sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
  ).run(
    newId(),
    user.id,
    sha256(token),
    createdAt,
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  );
  return { token, session: mapSession(user, createdAt) };
}

export function login(db, { username, password }) {
  const user = findByUsername(db, username ?? "");
  if (!user || user.password_hash !== hashPassword(password ?? "", user.password_salt)) {
    throw new Error("Wrong credentials");
  }
  if (!user.active) throw new Error("This account is disabled");
  return createSession(db, user);
}

export function sessionFromToken(db, token) {
  if (!token) return null;
  const row = db.prepare("SELECT * FROM app_sessions WHERE token_hash = ?").get(sha256(token));
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM app_sessions WHERE id = ?").run(row.id);
    return null;
  }
  const user = db.prepare("SELECT * FROM app_users WHERE id = ?").get(row.user_id);
  if (!user || !user.active) return null;
  db.prepare("UPDATE app_sessions SET last_seen_at = ? WHERE id = ?").run(nowIso(), row.id);
  return mapSession(user, row.created_at);
}

export function cloneSession(db, token) {
  const session = sessionFromToken(db, token);
  if (!session) throw new Error("Not signed in");
  const user = db.prepare("SELECT * FROM app_users WHERE id = ?").get(session.userId);
  return createSession(db, user);
}

export function logout(db, token) {
  if (token) db.prepare("DELETE FROM app_sessions WHERE token_hash = ?").run(sha256(token));
  return { ok: true };
}

function requireAdmin(db, token) {
  const session = sessionFromToken(db, token);
  if (!session) throw new Error("Not signed in");
  if (session.role !== "admin") throw new Error("Admin access required");
  return session;
}

export function listUsers(db, token) {
  requireAdmin(db, token);
  return db.prepare("SELECT * FROM app_users ORDER BY created_at ASC").all().map(mapUser);
}

export function createUser(db, token, input) {
  requireAdmin(db, token);
  const username = String(input.username ?? "").trim();
  if (!username) throw new Error("Username is required");
  if (!String(input.fullName ?? "").trim()) throw new Error("Full name is required");
  if (!input.password) throw new Error("Password is required for new users");
  if (findByUsername(db, username)) throw new Error("Username already exists");

  const role = normalizeRole(input.role);
  const salt = newSecret();
  const id = newId();
  db.prepare(
    `INSERT INTO app_users (id, username, full_name, password_hash, password_salt, role, permissions, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    username,
    String(input.fullName).trim(),
    hashPassword(input.password, salt),
    salt,
    role,
    JSON.stringify(role === "admin" ? MODULES : parsePermissions(input.permissions ?? [])),
    input.active === false ? 0 : 1,
  );
  return mapUser(db.prepare("SELECT * FROM app_users WHERE id = ?").get(id));
}

export function updateUser(db, token, id, input) {
  requireAdmin(db, token);
  const all = db.prepare("SELECT * FROM app_users").all();
  const current = all.find((u) => u.id === id);
  if (!current) throw new Error("User not found");

  const role = normalizeRole(input.role ?? current.role);
  const username = String(input.username ?? current.username).trim() || current.username;
  const active = input.active ?? Boolean(current.active);

  if (all.some((u) => u.id !== id && u.username.toLowerCase() === username.toLowerCase())) {
    throw new Error("Username already exists");
  }
  const remainingAdmins = all
    .map((u) => (u.id === id ? { role, active } : { role: normalizeRole(u.role), active: Boolean(u.active) }))
    .filter((u) => u.role === "admin" && u.active);
  if (remainingAdmins.length === 0) throw new Error("At least one active admin is required");

  db.prepare(
    `UPDATE app_users SET username = ?, full_name = ?, role = ?, permissions = ?, active = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    username,
    String(input.fullName ?? current.full_name).trim() || current.full_name,
    role,
    JSON.stringify(
      role === "admin" ? MODULES : parsePermissions(input.permissions ?? current.permissions),
    ),
    active ? 1 : 0,
    nowIso(),
    id,
  );

  if (input.password) {
    const salt = newSecret();
    db.prepare("UPDATE app_users SET password_salt = ?, password_hash = ? WHERE id = ?").run(
      salt,
      hashPassword(input.password, salt),
      id,
    );
  }
  if (input.password || active === false) {
    db.prepare("DELETE FROM app_sessions WHERE user_id = ?").run(id);
  }
  return mapUser(db.prepare("SELECT * FROM app_users WHERE id = ?").get(id));
}

export function deleteUser(db, token, id) {
  const session = requireAdmin(db, token);
  if (session.userId === id) throw new Error("You cannot delete your own account");
  const admins = db
    .prepare("SELECT * FROM app_users WHERE role = 'admin' AND active = 1")
    .all()
    .filter((u) => u.id !== id);
  if (admins.length === 0) throw new Error("At least one active admin is required");
  db.prepare("DELETE FROM app_users WHERE id = ?").run(id);
  return { ok: true };
}

export function migrateLegacyUsers(db, token, users = []) {
  requireAdmin(db, token);
  let imported = 0;
  for (const user of users) {
    if (!user?.username || !user?.password) continue;
    if (findByUsername(db, user.username)) continue;
    createUser(db, token, {
      username: user.username,
      fullName: user.fullName ?? user.username,
      password: user.password,
      role: user.role,
      permissions: user.permissions,
      active: user.active !== false,
    });
    imported += 1;
  }
  return { imported };
}
