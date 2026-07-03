// Client-side auth + user management (demo only — no real server security).
// - Multiple users supported, each with a set of module permissions.
// - Admins can create/edit/delete users. Non-admins are limited to their permissions.

const SESSION_KEY = "missy.auth.v2";
const USERS_KEY = "missy.users.v1";

export const MODULES = [
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

export type ModuleKey = (typeof MODULES)[number];
export type Role = "admin" | "cashier" | "custom";

export interface User {
  id: string;
  username: string;
  fullName: string;
  password: string; // demo-only plaintext
  role: Role;
  permissions: ModuleKey[]; // for admin, effectively all
  active: boolean;
  createdAt: string;
}

export interface Session {
  userId: string;
  username: string;
  fullName: string;
  role: Role;
  permissions: ModuleKey[];
  loggedInAt: string;
}

const DEFAULT_ADMIN: User = {
  id: "admin",
  username: "admin",
  fullName: "Administrator",
  password: "admin",
  role: "admin",
  permissions: [...MODULES],
  active: true,
  createdAt: new Date(0).toISOString(),
};

function readUsers(): User[] {
  if (typeof window === "undefined") return [DEFAULT_ADMIN];
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) {
      localStorage.setItem(USERS_KEY, JSON.stringify([DEFAULT_ADMIN]));
      return [DEFAULT_ADMIN];
    }
    const list = JSON.parse(raw) as User[];
    if (!list.some((u) => u.role === "admin")) list.unshift(DEFAULT_ADMIN);
    return list;
  } catch {
    return [DEFAULT_ADMIN];
  }
}

function writeUsers(users: User[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  window.dispatchEvent(new CustomEvent("missy:users-changed"));
}

export function listUsers(): User[] {
  return readUsers();
}

export function createUser(input: Omit<User, "id" | "createdAt">): User {
  const users = readUsers();
  if (users.some((u) => u.username.toLowerCase() === input.username.toLowerCase())) {
    throw new Error("Username already exists");
  }
  const user: User = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    permissions: input.role === "admin" ? [...MODULES] : input.permissions,
  };
  writeUsers([...users, user]);
  return user;
}

export function updateUser(id: string, patch: Partial<Omit<User, "id" | "createdAt">>): User {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error("User not found");
  const merged = { ...users[idx], ...patch } as User;
  if (merged.role === "admin") merged.permissions = [...MODULES];
  users[idx] = merged;
  writeUsers(users);
  // If updating current session's user, refresh session
  const session = getSession();
  if (session && session.userId === id) {
    saveSession({
      userId: merged.id,
      username: merged.username,
      fullName: merged.fullName,
      role: merged.role,
      permissions: merged.permissions,
      loggedInAt: session.loggedInAt,
    });
  }
  return merged;
}

export function deleteUser(id: string) {
  const users = readUsers();
  const remaining = users.filter((u) => u.id !== id);
  if (!remaining.some((u) => u.role === "admin" && u.active)) {
    throw new Error("At least one active admin is required");
  }
  writeUsers(remaining);
}

export function login(username: string, password: string): Session {
  const users = readUsers();
  const u = users.find(
    (u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password,
  );
  if (!u) throw new Error("Invalid username or password");
  if (!u.active) throw new Error("This account is disabled");
  const session: Session = {
    userId: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    permissions: u.permissions,
    loggedInAt: new Date().toISOString(),
  };
  saveSession(session);
  return session;
}

function saveSession(session: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent("missy:auth-changed"));
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new CustomEvent("missy:auth-changed"));
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function hasPermission(module: ModuleKey): boolean {
  const s = getSession();
  if (!s) return false;
  if (s.role === "admin") return true;
  return s.permissions.includes(module);
}

export function isAdmin(): boolean {
  return getSession()?.role === "admin";
}
