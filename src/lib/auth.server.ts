import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

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
] as const;

type ModuleKey = (typeof MODULES)[number];
type Role = "admin" | "cashier" | "custom";

export interface UserDTO {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  permissions: ModuleKey[];
  active: boolean;
  createdAt: string;
}

export interface SessionDTO {
  userId: string;
  username: string;
  fullName: string;
  role: Role;
  permissions: ModuleKey[];
  loggedInAt: string;
}

type DbUser = {
  id: string;
  username: string;
  full_name: string;
  password_hash: string;
  password_salt: string;
  role: string;
  permissions: string[];
  active: boolean;
  created_at: string;
};

type UserInput = {
  username: string;
  fullName: string;
  password?: string;
  role: Role;
  permissions: ModuleKey[];
  active: boolean;
};

type AppUserUpdate = Database["public"]["Tables"]["app_users"]["Update"];

function toHex(bytes: Uint8Array) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

async function hashPassword(password: string, salt: string) {
  return sha256(`${salt}:${password}`);
}

async function hashToken(token: string) {
  return sha256(token);
}

function createSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

function normalizeRole(role: string): Role {
  return role === "admin" || role === "cashier" || role === "custom" ? role : "cashier";
}

function sanitizePermissions(value: string[]): ModuleKey[] {
  return value.filter((item): item is ModuleKey => (MODULES as readonly string[]).includes(item));
}

function mapUser(row: DbUser): UserDTO {
  const role = normalizeRole(row.role);
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role,
    permissions: role === "admin" ? [...MODULES] : sanitizePermissions(row.permissions ?? []),
    active: row.active,
    createdAt: row.created_at,
  };
}

function mapSession(row: DbUser, loggedInAt: string): SessionDTO {
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

async function findUserByUsername(username: string) {
  const trimmed = username.trim().toLowerCase();
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id, username, full_name, password_hash, password_salt, role, permissions, active, created_at")
    .limit(1000);
  if (error) throw error;
  return ((data ?? []) as DbUser[]).find((user) => user.username.toLowerCase() === trimmed) ?? null;
}

async function getUserById(id: string) {
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id, username, full_name, password_hash, password_salt, role, permissions, active, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as DbUser | null) ?? null;
}

export async function loginWithPassword(username: string, password: string) {
  const user = await findUserByUsername(username);
  if (!user || user.password_hash !== (await hashPassword(password, user.password_salt))) {
    throw new Error("Wrong credentials");
  }
  if (!user.active) throw new Error("This account is disabled");

  const token = createSecret();
  const tokenHash = await hashToken(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin.from("app_sessions").insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error) throw error;

  return { token, session: mapSession(user, createdAt.toISOString()) };
}

export async function getSessionFromToken(token: string | null | undefined) {
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const { data: appSession, error } = await supabaseAdmin
    .from("app_sessions")
    .select("id, user_id, created_at, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!appSession) return null;

  if (new Date(appSession.expires_at).getTime() <= Date.now()) {
    await supabaseAdmin.from("app_sessions").delete().eq("id", appSession.id);
    return null;
  }

  const user = await getUserById(appSession.user_id);
  if (!user?.active) return null;
  await supabaseAdmin.from("app_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", appSession.id);
  return mapSession(user, appSession.created_at);
}

export async function logoutByToken(token: string) {
  await supabaseAdmin.from("app_sessions").delete().eq("token_hash", await hashToken(token));
  return { ok: true };
}

async function requireAdmin(token: string) {
  const session = await getSessionFromToken(token);
  if (!session) throw new Error("Not signed in");
  if (session.role !== "admin") throw new Error("Admin access required");
  return session;
}

export async function listUsersForAdmin(token: string) {
  await requireAdmin(token);
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id, username, full_name, password_hash, password_salt, role, permissions, active, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as DbUser[]).map(mapUser);
}

export async function createUserForAdmin(token: string, input: UserInput) {
  await requireAdmin(token);
  const username = input.username.trim();
  if (!username) throw new Error("Username is required");
  if (!input.fullName.trim()) throw new Error("Full name is required");
  if (!input.password) throw new Error("Password is required for new users");
  if (await findUserByUsername(username)) throw new Error("Username already exists");

  const role = normalizeRole(input.role);
  const salt = createSecret();
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .insert({
      username,
      full_name: input.fullName.trim(),
      password_salt: salt,
      password_hash: await hashPassword(input.password, salt),
      role,
      permissions: role === "admin" ? [...MODULES] : sanitizePermissions(input.permissions),
      active: input.active,
    })
    .select("id, username, full_name, password_hash, password_salt, role, permissions, active, created_at")
    .single();
  if (error) throw error;
  return mapUser(data as DbUser);
}

export async function updateUserForAdmin(token: string, id: string, input: Partial<UserInput>) {
  await requireAdmin(token);
  const { data: users, error: listError } = await supabaseAdmin
    .from("app_users")
    .select("id, username, full_name, password_hash, password_salt, role, permissions, active, created_at")
    .limit(1000);
  if (listError) throw listError;
  const current = ((users ?? []) as DbUser[]).find((user) => user.id === id);
  if (!current) throw new Error("User not found");

  const nextRole = normalizeRole(input.role ?? current.role);
  const nextUser: DbUser = {
    ...current,
    username: input.username?.trim() || current.username,
    full_name: input.fullName?.trim() || current.full_name,
    role: nextRole,
    permissions: nextRole === "admin" ? [...MODULES] : sanitizePermissions(input.permissions ?? current.permissions),
    active: input.active ?? current.active,
  };
  const activeAdmins = ((users ?? []) as DbUser[]).map((user) => (user.id === id ? nextUser : user)).filter(
    (user) => normalizeRole(user.role) === "admin" && user.active,
  );
  if (activeAdmins.length === 0) throw new Error("At least one active admin is required");

  const duplicate = ((users ?? []) as DbUser[]).find(
    (user) => user.id !== id && user.username.toLowerCase() === nextUser.username.toLowerCase(),
  );
  if (duplicate) throw new Error("Username already exists");

  const patch: AppUserUpdate = {
    username: nextUser.username,
    full_name: nextUser.full_name,
    role: nextRole,
    permissions: nextUser.permissions,
    active: nextUser.active,
  };
  if (input.password) {
    const salt = createSecret();
    patch.password_salt = salt;
    patch.password_hash = await hashPassword(input.password, salt);
  }

  const { data, error } = await supabaseAdmin
    .from("app_users")
    .update(patch)
    .eq("id", id)
    .select("id, username, full_name, password_hash, password_salt, role, permissions, active, created_at")
    .single();
  if (error) throw error;
  if (input.password || input.active === false) await supabaseAdmin.from("app_sessions").delete().eq("user_id", id);
  return mapUser(data as DbUser);
}

export async function deleteUserForAdmin(token: string, id: string) {
  await requireAdmin(token);
  const { data: users, error: listError } = await supabaseAdmin
    .from("app_users")
    .select("id, username, full_name, password_hash, password_salt, role, permissions, active, created_at")
    .limit(1000);
  if (listError) throw listError;
  const remaining = ((users ?? []) as DbUser[]).filter((user) => user.id !== id);
  if (!remaining.some((user) => normalizeRole(user.role) === "admin" && user.active)) {
    throw new Error("At least one active admin is required");
  }
  const { error } = await supabaseAdmin.from("app_users").delete().eq("id", id);
  if (error) throw error;
  return { ok: true };
}

export async function migrateLegacyUsersForAdmin(token: string, users: Array<UserInput & { username: string }>) {
  await requireAdmin(token);
  let imported = 0;
  for (const user of users.slice(0, 100)) {
    const username = user.username.trim();
    if (!username || username.toLowerCase() === "admin" || !user.password || !user.fullName.trim()) continue;
    if (await findUserByUsername(username)) continue;
    const role = normalizeRole(user.role);
    const salt = createSecret();
    const { error } = await supabaseAdmin.from("app_users").insert({
      username,
      full_name: user.fullName.trim(),
      password_salt: salt,
      password_hash: await hashPassword(user.password, salt),
      role,
      permissions: role === "admin" ? [...MODULES] : sanitizePermissions(user.permissions ?? []),
      active: user.active,
    });
    if (error) throw error;
    imported += 1;
  }
  return { imported };
}