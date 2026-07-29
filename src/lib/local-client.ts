/**
 * Offline data client.
 *
 * Talks to the bundled Node + SQLite server (server/index.mjs) over plain HTTP.
 * It exposes the same small chainable surface the app already used, so route
 * code did not have to change beyond its import path.
 */

type Filter = { column: string; op: string; value: unknown };
type Order = { column: string; ascending: boolean };
type Result<T> = { data: T; error: Error | null };

const API_BASE = "";

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok || payload.error) throw new Error(payload.error ?? `Request failed (${res.status})`);
  return payload.data as T;
}

class QueryBuilder<T = Record<string, unknown>> implements PromiseLike<Result<T>> {
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private selectCols = "*";
  private payload: unknown;
  private limitCount?: number;
  private rangeValue?: { from: number; to: number };
  private singleRow = false;
  private maybe = false;

  constructor(private table: string) {}

  select(columns = "*") {
    this.selectCols = columns;
    return this;
  }

  insert(rows: unknown) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(patch: unknown) {
    this.op = "update";
    this.payload = patch;
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  private filter(column: string, op: string, value: unknown) {
    this.filters.push({ column, op, value });
    return this;
  }

  eq(column: string, value: unknown) {
    return this.filter(column, "eq", value);
  }
  neq(column: string, value: unknown) {
    return this.filter(column, "neq", value);
  }
  gt(column: string, value: unknown) {
    return this.filter(column, "gt", value);
  }
  gte(column: string, value: unknown) {
    return this.filter(column, "gte", value);
  }
  lt(column: string, value: unknown) {
    return this.filter(column, "lt", value);
  }
  lte(column: string, value: unknown) {
    return this.filter(column, "lte", value);
  }
  like(column: string, value: string) {
    return this.filter(column, "like", value);
  }
  ilike(column: string, value: string) {
    return this.filter(column, "ilike", value);
  }
  is(column: string, value: unknown) {
    return this.filter(column, "is", value);
  }
  in(column: string, values: unknown[]) {
    return this.filter(column, "in", values);
  }
  not(column: string, op: string, value: unknown) {
    return this.filter(column, `not.${op}`, value);
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number) {
    this.rangeValue = { from, to };
    return this;
  }

  single() {
    this.singleRow = true;
    return this;
  }

  maybeSingle() {
    this.singleRow = true;
    this.maybe = true;
    return this;
  }

  private async run(): Promise<Result<T>> {
    try {
      const rows = await call<Record<string, unknown>[]>("/api/data", {
        op: this.op,
        table: this.table,
        select: this.selectCols,
        filters: this.filters,
        order: this.orders,
        limit: this.limitCount,
        range: this.rangeValue,
        rows: this.payload,
        patch: this.payload,
      });

      if (this.singleRow) {
        if (rows.length === 0 && !this.maybe) throw new Error("No rows found");
        return { data: (rows[0] ?? null) as T, error: null };
      }
      return { data: rows as T, error: null };
    } catch (error) {
      return { data: null as T, error: error as Error };
    }
  }

  then<R1 = Result<T>, R2 = never>(
    onfulfilled?: ((value: Result<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

/** Local disk storage that mimics the few storage calls the app makes. */
function storageBucket() {
  return {
    async upload(path: string, file: File, _options?: { cacheControl?: string; upsert?: boolean }) {
      try {
        const data = await fileToBase64(file);
        const saved = await call<{ path: string; url: string }>("/api/storage/upload", {
          name: path,
          data,
        });
        return { data: saved, error: null };
      } catch (error) {
        return { data: null, error: error as Error };
      }
    },
    async createSignedUrl(path: string, _expiresIn?: number) {
      const url = path.startsWith("/") ? path : `/uploads/product-images/${path}`;
      return { data: { signedUrl: url }, error: null };
    },
    getPublicUrl(path: string) {
      const url = path.startsWith("/") ? path : `/uploads/product-images/${path}`;
      return { data: { publicUrl: url } };
    },
  };
}

export const localDb = {
  from<T = Record<string, unknown>>(table: string) {
    return new QueryBuilder<T>(table);
  },
  async rpc(fn: string, args?: Record<string, unknown>) {
    try {
      const data = await call<unknown>("/api/rpc", { fn, args: args ?? {} });
      return { data, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  },
  storage: {
    from: (_bucket?: string) => storageBucket(),
  },
};

/** Backup + restore controls used by the Settings page. */
export const backups = {
  async list() {
    const res = await fetch("/api/backups");
    const payload = (await res.json()) as { data?: BackupFile[]; error?: string };
    if (payload.error) throw new Error(payload.error);
    return payload.data ?? [];
  },
  create: (token: string) => call<BackupFile>("/api/backups", { token }),
  restore: (token: string, name: string) =>
    call<{ ok: boolean }>("/api/backups/restore", { token, name }),
};

export interface BackupFile {
  name: string;
  size: number;
  createdAt: string;
}

export const authApi = {
  login: (username: string, password: string) =>
    call<{ token: string; session: unknown }>("/api/auth", { op: "login", username, password }),
  session: (token: string) => call<unknown>("/api/auth", { op: "session", token }),
  clone: (token: string) =>
    call<{ token: string; session: unknown }>("/api/auth", { op: "clone", token }),
  logout: (token: string) => call<unknown>("/api/auth", { op: "logout", token }),
  listUsers: (token: string) => call<unknown[]>("/api/auth", { op: "users.list", token }),
  createUser: (token: string, user: unknown) =>
    call<unknown>("/api/auth", { op: "users.create", token, user }),
  updateUser: (token: string, id: string, user: unknown) =>
    call<unknown>("/api/auth", { op: "users.update", token, id, user }),
  deleteUser: (token: string, id: string) =>
    call<unknown>("/api/auth", { op: "users.delete", token, id }),
  migrateUsers: (token: string, users: unknown[]) =>
    call<{ imported: number }>("/api/auth", { op: "users.migrate", token, users }),
};

/** Live updates: the server pushes a small event whenever data changes. */
export function subscribeToChanges(onChange: (event: { table: string; op: string }) => void) {
  if (typeof window === "undefined" || typeof EventSource === "undefined") return () => undefined;
  const source = new EventSource("/api/events");
  source.onmessage = (event) => {
    try {
      onChange(JSON.parse(event.data));
    } catch {
      /* ignore malformed frame */
    }
  };
  return () => source.close();
}
