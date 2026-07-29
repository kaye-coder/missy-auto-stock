import { authApi } from "./local-client";

const SESSION_KEY = "missy.auth.v2";
const USERS_KEY = "missy.users.v1";
const TAB_ID_KEY = "missy.tab.id.v1";
const TAB_CHANNEL = "missy.tab-isolation.v1";
const INSTANCE_ID = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

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
  password?: string;
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

type StoredAuth = { token: string; session: Session };

type TabMessage =
  | { type: "probe"; tabId: string; instanceId: string }
  | { type: "duplicate"; tabId: string; instanceId: string; target: string };

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

function readLegacyUsers(): User[] {
  return readUsers().filter((user) => user.username.toLowerCase() !== "admin" && !!user.password);
}

function getStoredAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

function getToken(): string {
  const token = getStoredAuth()?.token;
  if (!token) throw new Error("Not signed in");
  return token;
}

function getTabId(): string {
  if (typeof window === "undefined") return INSTANCE_ID;
  let tabId = sessionStorage.getItem(TAB_ID_KEY);
  if (!tabId) {
    tabId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    sessionStorage.setItem(TAB_ID_KEY, tabId);
  }
  return tabId;
}

async function importLegacyUsers() {
  const legacy = readLegacyUsers();
  const token = getStoredAuth()?.token;
  const session = getStoredAuth()?.session;
  if (!token || session?.role !== "admin" || legacy.length === 0) return;
  const result = await authApi.migrateUsers(token, legacy);
  if (result.imported > 0) window.dispatchEvent(new CustomEvent("missy:users-changed"));
}

export async function listUsers(): Promise<User[]> {
  await importLegacyUsers();
  return authApi.listUsers(getToken()) as Promise<User[]>;
}

export async function createUser(input: Omit<User, "id" | "createdAt">): Promise<User> {
  const user = (await authApi.createUser(getToken(), { ...input, password: input.password ?? "" })) as User;
  window.dispatchEvent(new CustomEvent("missy:users-changed"));
  return user as User;
}

export async function updateUser(id: string, patch: Partial<Omit<User, "id" | "createdAt">>): Promise<User> {
  const user = (await authApi.updateUser(getToken(), id, patch)) as User;
  const auth = getStoredAuth();
  if (auth && auth.session.userId === id) {
    saveAuth({ token: auth.token, session: { ...auth.session, ...user, userId: user.id } });
  }
  window.dispatchEvent(new CustomEvent("missy:users-changed"));
  return user as User;
}

export async function deleteUser(id: string) {
  await authApi.deleteUser(getToken(), id);
  window.dispatchEvent(new CustomEvent("missy:users-changed"));
}

export async function login(username: string, password: string): Promise<Session> {
  const auth = (await authApi.login(username, password)) as StoredAuth;
  saveAuth(auth);
  await importLegacyUsers();
  return auth.session;
}

function saveAuth(auth: StoredAuth) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(auth));
  window.dispatchEvent(new CustomEvent("missy:auth-changed"));
}

export function startTabSessionIsolation(onSessionChange: (session: Session | null) => void) {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return () => undefined;
  const channel = new BroadcastChannel(TAB_CHANNEL);
  let cloning = false;

  const cloneForThisTab = async () => {
    if (cloning) return;
    const auth = getStoredAuth();
    if (!auth) return;
    cloning = true;
    try {
      sessionStorage.setItem(TAB_ID_KEY, crypto.randomUUID());
      const next = (await authApi.clone(auth.token)) as StoredAuth;
      saveAuth(next);
      onSessionChange(next.session);
    } catch {
      onSessionChange(getSession());
    } finally {
      cloning = false;
    }
  };

  channel.onmessage = (event: MessageEvent<TabMessage>) => {
    const message = event.data;
    if (!message || message.instanceId === INSTANCE_ID) return;
    const tabId = getTabId();
    if (message.type === "probe" && message.tabId === tabId) {
      channel.postMessage({ type: "duplicate", tabId, instanceId: INSTANCE_ID, target: message.instanceId } satisfies TabMessage);
    }
    if (message.type === "duplicate" && message.target === INSTANCE_ID && message.tabId === tabId) {
      void cloneForThisTab();
    }
  };

  window.setTimeout(() => {
    channel.postMessage({ type: "probe", tabId: getTabId(), instanceId: INSTANCE_ID } satisfies TabMessage);
  }, 200);

  return () => channel.close();
}

export async function refreshSession(): Promise<Session | null> {
  const token = getStoredAuth()?.token;
  if (!token) return null;
  const session = (await authApi.session(token)) as Session | null;
  if (!session) {
    sessionStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new CustomEvent("missy:auth-changed"));
    return null;
  }
  saveAuth({ token, session });
  return session;
}

export async function logout() {
  const token = getStoredAuth()?.token;
  sessionStorage.removeItem(SESSION_KEY);
  if (token) await authApi.logout(token).catch(() => undefined);
  window.dispatchEvent(new CustomEvent("missy:auth-changed"));
}

export function getAuthToken(): string | null {
  return getStoredAuth()?.token ?? null;
}

export function getSession(): Session | null {
  return getStoredAuth()?.session ?? null;
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
