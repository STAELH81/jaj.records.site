import { getDeployStore, getStore } from "@netlify/blobs";
import { admin, verifyRequestOrigin } from "@netlify/identity";
import { getSessionUser } from "./_shared/identity-session.mts";
import type { Config, Context } from "@netlify/functions";

declare const Netlify: any;

const STORE_NAME = "aq-acc-identities-v1";
const ADMIN_MIN = 1;
const ADMIN_MAX = 99;
const USER_MIN = 100;
const USER_MAX = 999;

function getAccStore() {
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

function normalizeRoles(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map((role) => String(role).trim().toLowerCase()).filter(Boolean))]
    : [];
}

function meta(user: any) {
  return user?.user_metadata || user?.userMetadata || {};
}

function displayName(user: any) {
  const m = meta(user);
  return String(m.display_name || m.full_name || user?.email?.split("@")[0] || "Utilisateur").slice(0, 48);
}

function aquertyMail(user: any) {
  const m = meta(user);
  if (m.aquerty_mail) return String(m.aquerty_mail).slice(0, 120);
  const local = String(user?.email?.split("@")[0] || "user")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ".")
    .slice(0, 48);
  return `${local || "user"}@aquerty.fr`;
}

async function getLiveUser(sessionUser: any) {
  try {
    return await admin.getUser(sessionUser.id);
  } catch (error) {
    console.warn("[AQ ACC] live Identity lookup failed", error);
    return sessionUser;
  }
}

async function allocateId(store: any, user: any, isAdmin: boolean) {
  const userKey = `users/${user.id}.json`;
  const existing = await store.get(userKey, { type: "json" });

  if (existing?.accId) {
    const n = Number(existing.accId);
    const inCorrectRange = isAdmin
      ? n >= ADMIN_MIN && n <= ADMIN_MAX
      : n >= USER_MIN && n <= USER_MAX;

    if (inCorrectRange) return existing;

    await store.delete(`ids/${n}.json`);
  }

  const start = isAdmin ? ADMIN_MIN : USER_MIN;
  const end = isAdmin ? ADMIN_MAX : USER_MAX;

  for (let id = start; id <= end; id += 1) {
    const reverseKey = `ids/${id}.json`;
    const taken = await store.get(reverseKey, { type: "json" });
    if (taken) continue;

    const record = {
      userId: user.id,
      accId: id,
      role: isAdmin ? "admin" : "user",
      displayName: displayName(user),
      aquertyMail: aquertyMail(user),
      assignedAt: new Date().toISOString(),
    };

    await store.setJSON(reverseKey, record);
    await store.setJSON(userKey, record);
    return record;
  }

  throw new Error(isAdmin ? "admin_id_pool_full" : "user_id_pool_full");
}

export default async (request: Request, _context: Context) => {
  const store = getAccStore();
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    if (request.method === "GET") {
      return json({
        authenticated: false,
        role: "guest",
        accId: null,
      });
    }
    return json({ error: "login_required" }, { status: 401 });
  }

  const live = await getLiveUser(sessionUser);
  const roles = normalizeRoles(live?.roles);
  const isAdmin = roles.includes("admin");
  const current = await allocateId(store, live, isAdmin);

  if (request.method === "GET") {
    return json({
      authenticated: true,
      userId: live.id,
      email: live.email,
      displayName: current.displayName,
      aquertyMail: current.aquertyMail,
      roles,
      role: isAdmin ? "admin" : "user",
      accId: current.accId,
    });
  }

  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, {
      status: 405,
      headers: { Allow: "GET, POST" },
    });
  }

  try {
    verifyRequestOrigin(request);
  } catch {
    return json({ error: "invalid_origin" }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }

  const action = String(body?.action || "");
  if (action !== "validate_id") {
    return json({ error: "unknown_action" }, { status: 400 });
  }

  const raw = String(body?.accId ?? "").trim();
  if (!/^\d{1,3}$/.test(raw)) {
    return json({ ok: false, error: "invalid_id_format" }, { status: 400 });
  }

  const id = Number(raw);
  if (id < ADMIN_MIN || id > USER_MAX) {
    return json({ ok: false, error: "invalid_id_range" }, { status: 400 });
  }

  const record = await store.get(`ids/${id}.json`, { type: "json" });
  if (!record) {
    return json({ ok: false, error: "unknown_id" }, { status: 404 });
  }

  if (id >= USER_MIN) {
    return json({
      ok: true,
      mode: "user",
      accId: id,
      displayName: record.displayName,
    });
  }

  if (!isAdmin) {
    return json({ ok: false, error: "admin_role_required" }, { status: 403 });
  }

  if (Number(current.accId) !== id) {
    return json({ ok: false, error: "admin_id_not_current_session" }, { status: 403 });
  }

  return json({
    ok: true,
    mode: "admin_password",
    accId: id,
    displayName: current.displayName,
    email: live.email,
  });
};

export const config: Config = {
  path: "/api/acc-auth",
};
