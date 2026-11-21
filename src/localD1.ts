// Node-only SQLite adapter. Importing it never opens a database.
import { DatabaseSync } from "node:sqlite";

export function createLocalD1(sqlitePath = ":memory:"): D1Database & { close(): void } {
  const db = new DatabaseSync(sqlitePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");

  const normalizeBindings = (values: unknown[]) =>
    values.map((v) => {
      if (v === undefined || v === null) return null;
      if (typeof v === "boolean") return v ? 1 : 0;
      return v as string | number | Uint8Array | bigint;
    });

  const makeStatement = (query: string, boundValues: unknown[] = []): D1PreparedStatement => {
    const execRun = () => {
      const stmt = db.prepare(query);
      const info = stmt.run(...(normalizeBindings(boundValues) as any[]));
      return {
        results: [] as any[],
        success: true,
        meta: {
          changes: Number(info.changes || 0),
          last_row_id: Number(info.lastInsertRowid || 0),
          changed_db: Number(info.changes || 0) > 0,
          duration: 0,
        },
      };
    };

    const execAll = () => {
      const stmt = db.prepare(query);
      const trimmed = query.trimStart().toUpperCase();
      if (
        trimmed.startsWith("SELECT") ||
        trimmed.startsWith("PRAGMA") ||
        trimmed.startsWith("WITH") ||
        /\bRETURNING\b/i.test(query)
      ) {
        const rows = stmt.all(...(normalizeBindings(boundValues) as any[])) as Record<string, unknown>[];
        return {
          results: rows,
          success: true,
          meta: {
            rows_read: rows.length,
            duration: 0,
          },
        };
      }
      return execRun();
    };

    return {
      bind(...values: unknown[]) {
        return makeStatement(query, values);
      },
      async first<T = unknown>(colName?: string): Promise<T | null> {
        const stmt = db.prepare(query);
        const row = stmt.get(...(normalizeBindings(boundValues) as any[])) as Record<string, unknown> | undefined;
        if (!row) return null;
        if (colName) return (row[colName] as T) ?? null;
        return row as T;
      },
      async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
        return execRun() as D1Result<T>;
      },
      async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
        return execAll() as D1Result<T>;
      },
      async raw<T = unknown[]>(): Promise<T[]> {
        const rows = execAll().results;
        return rows.map((row) => Object.values(row)) as T[];
      },
    };
  };

  return {
    close() { db.close(); },
    prepare(query: string) {
      return makeStatement(query, []);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      db.exec("BEGIN");
      try {
        const results: D1Result<T>[] = [];
        for (const stmt of statements) {
          results.push(await stmt.all<T>());
        }
        db.exec("COMMIT");
        return results;
      } catch (err) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // ignore rollback error
        }
        throw err;
      }
    },
    async exec(query: string): Promise<{ count: number; duration: number }> {
      db.exec(query);
      return { count: 1, duration: 0 };
    },
    async dump(): Promise<ArrayBuffer> {
      return new ArrayBuffer(0);
    },
  };
}
