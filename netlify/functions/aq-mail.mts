import { getStore } from "@netlify/blobs";
import { admin, verifyRequestOrigin } from "@netlify/identity";
import { getSessionUser } from "./_shared/identity-session.mts";
import type { Config, Context } from "@netlify/functions";

declare const Netlify: any;

const STORE_NAME = "aq-mail-v2";
const PREVIEW_STORE_NAME = "aq-mail-preview-v2";
const MESSAGE_LIMIT = 250;

function getMailStore() {
  const isProduction = Netlify?.context?.deploy?.context === "production";
  return getStore(isProduction ? STORE_NAME : PREVIEW_STORE_NAME, { consistency: "strong" });
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

  const idPart = String(user?.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 5).toLowerCase();
  return `${slugifyAquerty(displayNameFor(user))}.${idPart || "neo"}@aquerty.fr`;
}

function normalizeAddress(value: unknown) {
  const mail = cleanSingleLine(value, 120).toLowerCase();
  return /^[a-z0-9._-]{1,64}@aquerty\.fr$/.test(mail) ? mail : "";
}

function mailboxKey(mail: string) {
  return `mailbox/${encodeURIComponent(mail)}.json`;
}

function normalizeMessages(value: any) {
  return Array.isArray(value)
    ? value
        .filter((item) => item && item.id && item.folder)
        .slice(0, MESSAGE_LIMIT)
    : [];
}

function welcomeMessage(mail: string) {
  const now = new Date().toISOString();
  return {
    id: `welcome-${crypto.randomUUID()}`,
    threadId: "aq-welcome",
    folder: "inbox",
    from: "system@aquerty.fr",
    to: mail,
    subject: "Bienvenue sur AQ-Mail",
    body: "AQ-Mail est connecté à AQ-NET. Tu peux envoyer des messages aux autres adresses @aquerty.fr.",
    createdAt: now,
    unread: true,
    system: true,
  };
}

async function readMailbox(store: any, mail: string, ensureWelcome = true) {
  const key = mailboxKey(mail);
  const saved = await store.get(key, { type: "json" });
  let messages = normalizeMessages(saved?.messages);

  if (!saved && ensureWelcome) {
    messages = [welcomeMessage(mail)];
    await store.setJSON(key, { version: 2, mail, messages, updatedAt: new Date().toISOString() });
  }

  return messages;
}

async function writeMailbox(store: any, mail: string, messages: any[]) {
  const trimmed = normalizeMessages(messages)
    .sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, MESSAGE_LIMIT);
  await store.setJSON(mailboxKey(mail), {
    version: 2,
    mail,
    messages: trimmed,
    updatedAt: new Date().toISOString(),
  });
  return trimmed;
}

async function ownContext() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;
  const live = await liveIdentity(sessionUser);
  return { sessionUser, live, mail: aquertyMailFor(live) };
}

export default async (request: Request, _context: Context) => {
  const store = getMailStore();
  const own = await ownContext();
  if (!own) return json({ error: "login_required" }, { status: 401 });

  if (request.method === "GET") {
    const messages = await readMailbox(store, own.mail, true);
    return json({ address: own.mail, messages });
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
    const shared = {
      threadId,
      from: own.mail,
      to,
      subject,
      body: messageBody,
      createdAt,
    };

    const sent = {
      ...shared,
      id: crypto.randomUUID(),
      folder: "sent",
      unread: false,
    };
    const inbox = {
      ...shared,
      id: crypto.randomUUID(),
      folder: "inbox",
      unread: true,
    };

    if (to === own.mail) {
      const messages = await readMailbox(store, own.mail, true);
      await writeMailbox(store, own.mail, [inbox, sent, ...messages]);
    } else {
      const [senderMessages, recipientMessages] = await Promise.all([
        readMailbox(store, own.mail, true),
        readMailbox(store, to, false),
      ]);
      await writeMailbox(store, own.mail, [sent, ...senderMessages]);
      await writeMailbox(store, to, [inbox, ...recipientMessages]);
    }

    return json({ ok: true, message: sent });
  }

  const id = cleanSingleLine(body.id, 120);
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) return json({ error: "invalid_message_id" }, { status: 400 });

  const messages = await readMailbox(store, own.mail, true);
  const index = messages.findIndex((message: any) => message.id === id);
  if (index < 0) return json({ error: "message_not_found" }, { status: 404 });

  if (action === "mark_read") {
    messages[index] = { ...messages[index], unread: false, readAt: new Date().toISOString() };
    await writeMailbox(store, own.mail, messages);
    return json({ ok: true });
  }

  if (action === "trash") {
    const current = messages[index];
    messages[index] = {
      ...current,
      previousFolder: current.folder === "trash" ? current.previousFolder || "inbox" : current.folder,
      folder: "trash",
      unread: false,
      trashedAt: new Date().toISOString(),
    };
    await writeMailbox(store, own.mail, messages);
    return json({ ok: true });
  }

  if (action === "delete") {
    if (messages[index].folder !== "trash") return json({ error: "trash_first" }, { status: 409 });
    messages.splice(index, 1);
    await writeMailbox(store, own.mail, messages);
    return json({ ok: true });
  }

  return json({ error: "unknown_action" }, { status: 400 });
};

export const config: Config = {
  path: "/api/aq-mail",
};
