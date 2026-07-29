/**
 * Thin SQLite adapter.
 *
 * Prefers the native `better-sqlite3` package when it is installed (fastest),
 * and otherwise falls back to Node's own built-in `node:sqlite`, so the app
 * runs with zero native build steps on a fresh Mac.
 */

async function loadDriver(file) {
  try {
    const { default: BetterSqlite3 } = await import("better-sqlite3");
    return wrapBetter(new BetterSqlite3(file));
  } catch {
    const { DatabaseSync } = await import("node:sqlite");
    return wrapNode(new DatabaseSync(file));
  }
}

function wrapBetter(db) {
  return {
    driver: "better-sqlite3",
    exec: (sql) => db.exec(sql),
    pragma: (sql) => db.pragma(sql),
    prepare: (sql) => db.prepare(sql),
    transaction: (fn) => db.transaction(fn),
    close: () => db.close(),
  };
}

function wrapNode(db) {
  const prepare = (sql) => {
    const stmt = db.prepare(sql);
    return {
      get: (...args) => stmt.get(...args) ?? undefined,
      all: (...args) => stmt.all(...args),
      run: (...args) => stmt.run(...args),
    };
  };
  return {
    driver: "node:sqlite",
    exec: (sql) => db.exec(sql),
    pragma: (sql) => db.exec(`PRAGMA ${sql};`),
    prepare,
    transaction:
      (fn) =>
      (...args) => {
        db.exec("BEGIN");
        try {
          const result = fn(...args);
          db.exec("COMMIT");
          return result;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    close: () => db.close(),
  };
}

export async function open(file) {
  return loadDriver(file);
}
