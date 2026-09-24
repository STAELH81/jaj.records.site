import { withMigrationMaintenance } from './_shared/migration-maintenance.mjs';
import { getStore, getDeployStore } from "@netlify/blobs";
import { getUser, verifyRequestOrigin } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";

declare const Netlify: any;

const STORE_NAME = "aq-neo-user-state";
const MAX_SNAPSHOT_BYTES = 96 * 1024;

function getStateStore() {
  if (Netlify?.context?.deploy?.context === "production") {
    return getStore(STORE_NAME, { consistency: "strong" });
  }
  return getDeployStore(STORE_NAME);
}

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init.headers || {}),
    },
  });
}

function sanitizeSnapshot(value: any) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_snapshot");
  }

  const snapshot = {
    version: 1,
    settings: value.settings && typeof value.settings === "object" ? value.settings : {},
    recents: Array.isArray(value.recents) ? value.recents.slice(0, 12) : [],
    state: value.state && typeof value.state === "object" ? value.state : {},
    desktopLayout: value.desktopLayout && typeof value.desktopLayout === "object" ? value.desktopLayout : {},
    session: value.session && typeof value.session === "object" ? value.session : {},
    player: value.player && typeof value.player === "object" ? value.player : {},
  };

  const size = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
  if (size > MAX_SNAPSHOT_BYTES) {
    throw new Error("snapshot_too_large");
  }

  return snapshot;
}

const migrationGuardedHandler = async (request: Request, _context: Context) => {
  const user = await getUser();
  if (!user) {
    return json({ error: "unauthorized" }, { status: 401 });
  }

  const store = getStateStore();
  const key = `users/${user.id}.json`;

  if (request.method === "GET") {
    const saved = await store.get(key, { type: "json" });

    if (!saved) {
      return json({ snapshot: null, updatedAt: null });
    }

    return json({
      snapshot: saved.snapshot ?? saved,
      updatedAt: saved.updatedAt ?? null,
    });
  }

  if (request.method === "PUT") {
    try {
      verifyRequestOrigin(request);

      const body = await request.json();
      const snapshot = sanitizeSnapshot(body?.snapshot);
      const updatedAt = new Date().toISOString();

      await store.setJSON(key, {
        snapshot,
        updatedAt,
      });

      return json({ ok: true, updatedAt });
    } catch (error: any) {
      const code = String(error?.message || "invalid_request");
      const status = code === "snapshot_too_large" ? 413 : code === "invalid_snapshot" ? 400 : 403;
      return json({ error: code }, { status });
    }
  }

  return json({ error: "method_not_allowed" }, {
    status: 405,
    headers: { Allow: "GET, PUT" },
  });
};

export default withMigrationMaintenance(migrationGuardedHandler);

export const config: Config = {
  path: "/api/aq-sync",
};
