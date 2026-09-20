import { getDeployStore, getStore } from "@netlify/blobs";
import { admin, getUser, verifyRequestOrigin } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";

declare const Netlify: any;

const STORE_NAME = "aq-mail-v1";
const MESSAGE_LIMIT = 250;

function getMailStore() {
  if (Netlify?.context?.deploy?.context === "production") {
    return getStore(STORE_NAME, { consistency: "strong" });
  }
  // Preview writes must be immediately visible after Send/Delete, otherwise
  // deploy-scoped eventual consistency can make AQ-Mail look broken for ~60 s.
  return getDeployStore({ name: STORE_NAME, consistency: "strong" } as any);
}

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init.headers || {}) },
  });
}

function cleanSingleLine(value: unknown, max: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanText(value: unknown, max: number) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}

function identityMetadata(user: any) {
  return user?.user_metadata || user?.userMetadata || {};
}

async function liveIdentity(sessionUser: any) {
  try {
    return await admin.getUser(sessionUser.id);
  } catch {
    return sessionUser;
  }
}

function slugifyAquerty(value: unknown) {
  return String(value || "user")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 18) || "user";
}

function displayNameFor(user: any) {
  const meta = identityMetadata(user);
  return meta.display_name || meta.full_name || user?.email?.split("@")[0] || "Utilisateur";
}

function aquertyMailFor(user: any) {
  const meta = identityMetadata(user);
  const explicit = cleanSingleLine(meta.aquerty_mail, 120).toLowerCase();
  if (/^[a-z0-9._-]{1,64}@aquerty\.fr$/.test(explicit)) return explicit;

  // Keep the server fallback byte-for-byte compatible with js/auth.js.
  // Older accounts may not have aquerty_mail in Identity metadata.
  const idPart = String(user?.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 5).toLowerCase();
  return `${slugifyAquerty(displayNameFor(user))}.${idPart || "neo"}@aquerty.fr`;
}

function normalizeAddress(value: unknown) {
  const mail = cleanSingleLine(value, 120).toLowerCase();
  return /^[a-z0-9._-]{1,64}@aquerty\.fr$/.test(mail) ? mail : "";
}

function mailboxPrefix(mail: string) {
  return `mailboxes/${encodeURIComponent(mail)}/`;
}

async function listJSON(store: any, prefix: string) {
  const listed = await store.list({ prefix });
  const values = await Promise.all(listed.blobs.map((item: any) => store.get(item.key, { type: "json" })));
  return values.filter(Boolean);
}

async function seedMailbox(store: any, mail: string) {
  const marker = `${mailboxPrefix(mail)}.seed-v1.json`;
  if (await store.get(marker, { type: "json" })) return;
  const now = new Date().toISOString();
  const id = `welcome-${crypto.randomUUID()}`;
  await store.setJSON(`${mailboxPrefix(mail)}${id}.json`, {
    id,
    threadId: "aq-welcome",
    folder: "inbox",
    from: "system@aquerty.fr",
    to: mail,
    subject: "Bienvenue sur AQ-Mail",
    body: "AQ-Mail est maintenant connecté à AQ-NET. Tu peux envoyer des messages aux autres adresses @aquerty.fr.",
    createdAt: now,
    unread: true,
    system: true,
  });
  await store.setJSON(marker, { seededAt: now });
}

async function ownContext() {
  const sessionUser = await getUser();
  if (!sessionUser) return null;
  const live = await liveIdentity(sessionUser);
  return { sessionUser, live, mail: aquertyMailFor(live) };
}

export default async (request: Request, _context: Context) => {
  const store = getMailStore();
  const own = await ownContext();
  if (!own) return json({ error: "login_required" }, { status: 401 });

  await seedMailbox(store, own.mail);

  if (request.method === "GET") {
    const messages = await listJSON(store, mailboxPrefix(own.mail));
    messages.sort((a: any, b: any) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")));
    return json({
      address: own.mail,
      messages: messages.filter((item: any) => item?.id && !String(item.id).startsWith(".seed")).slice(0, MESSAGE_LIMIT),
    });
  }

  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "GET, POST" } });
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

  if (action === "send") {
    const to = normalizeAddress(body.to);
    const subject = cleanSingleLine(body.subject, 140) || "(sans sujet)";
    const messageBody = cleanText(body.body, 12000);
    if (!to) return json({ error: "invalid_recipient" }, { status: 400 });
    if (!messageBody) return json({ error: "empty_message" }, { status: 400 });

    const threadId = cleanSingleLine(body.threadId, 120) || crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const inboxId = crypto.randomUUID();
    const sentId = crypto.randomUUID();

    const shared = {
      threadId,
      from: own.mail,
      to,
      subject,
      body: messageBody,
      createdAt,
    };

    await Promise.all([
      store.setJSON(`${mailboxPrefix(to)}${inboxId}.json`, {
        ...shared,
        id: inboxId,
        folder: "inbox",
        unread: true,
      }),
      store.setJSON(`${mailboxPrefix(own.mail)}${sentId}.json`, {
        ...shared,
        id: sentId,
        folder: "sent",
        unread: false,
      }),
    ]);

    return json({ ok: true, message: { ...shared, id: sentId, folder: "sent", unread: false } });
  }

  const id = cleanSingleLine(body.id, 120);
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) return json({ error: "invalid_message_id" }, { status: 400 });
  const key = `${mailboxPrefix(own.mail)}${id}.json`;
  const message = await store.get(key, { type: "json" });
  if (!message) return json({ error: "message_not_found" }, { status: 404 });

  if (action === "mark_read") {
    await store.setJSON(key, { ...message, unread: false, readAt: new Date().toISOString() });
    return json({ ok: true });
  }

  if (action === "trash") {
    await store.setJSON(key, {
      ...message,
      previousFolder: message.folder === "trash" ? message.previousFolder || "inbox" : message.folder,
      folder: "trash",
      unread: false,
      trashedAt: new Date().toISOString(),
    });
    return json({ ok: true });
  }

  if (action === "delete") {
    if (message.folder !== "trash") return json({ error: "trash_first" }, { status: 409 });
    await store.delete(key);
    return json({ ok: true });
  }

  return json({ error: "unknown_action" }, { status: 400 });
};

export const config: Config = {
  path: "/api/aq-mail",
};
