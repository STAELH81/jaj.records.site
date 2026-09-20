import { createHash } from "node:crypto";

export const categories = [
  "general",
  "music",
  "sport",
  "gaming",
  "culture",
  "tech",
];
const json = (data, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const fail = (code, status = 400) => {
  throw Object.assign(new Error(code), { status });
};
const id = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(value)
    ? value
    : fail("invalid_id");
const text = (value, max, required = true) => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    fail("invalid_text");
  return value.trim();
};
const get = (store, key) => store.get(key, { type: "json" });
const record = (store, key) => store.getWithMetadata(key, { type: "json" });
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function list(store, prefix) {
  const { blobs } = await store.list({ prefix });
  const result = [];
  for (let i = 0; i < blobs.length; i += 20)
    result.push(
      ...(await Promise.all(
        blobs.slice(i, i + 20).map((item) => get(store, item.key)),
      )),
    );
  return result.filter(Boolean);
}
async function put(store, key, value, previous) {
  const result = await store.setJSON(
    key,
    value,
    previous ? { onlyIfMatch: previous.etag } : { onlyIfNew: true },
  );
  if (!result.modified) fail("conflict", 409);
}
// Claim immutable hourly slots rather than incrementing a shared counter.
async function quota(store, userId, kind, limit) {
  const prefix = `community-rate/${userId}/${kind}-${new Date().toISOString().slice(0, 13)}`;
  for (let i = 0; i < limit; i++) {
    const result = await store.setJSON(
      `${prefix}/${i}.json`,
      { claimed: true },
      { onlyIfNew: true },
    );
    if (result.modified) return;
  }
  fail("rate_limited", 429);
}
const memberView = (p) => ({
  id: p.id || p.userId,
  name: p.name || p.displayName || "Membre",
});
const topicView = (t) => ({
  id: t.id,
  title: t.title,
  text: t.hidden ? "" : t.text,
  authorId: t.authorId,
  authorName: t.authorName,
  createdAt: t.createdAt,
  category: categories.includes(t.category) ? t.category : "general",
  locked: !!t.locked,
  hidden: !!t.hidden,
});
const replyView = (r) => ({
  id: r.id,
  topicId: r.topicId,
  authorId: r.authorId,
  authorName: r.authorName,
  text: r.hidden ? "" : r.text,
  createdAt: r.createdAt,
  hidden: !!r.hidden,
});

export function createCommunityHandler({
  getUser,
  liveUser,
  verifyOrigin,
  getStore,
}) {
  return async (request, context) => {
    try {
      if (!["GET", "POST"].includes(request.method))
        return json({ error: "method_not_allowed" }, 405);
      const url = new URL(request.url),
        mail = url.pathname === "/api/aq-mail";
      const session = await getUser();
      if (mail && !session?.id) fail("login_required", 401);
      const store = getStore(context),
        uid = session?.id ? id(session.id) : null;
      if (request.method === "GET") {
        const view =
          url.searchParams.get("view") || (mail ? "mailbox" : "topics");
        if (mail) {
          if (view === "members") {
            const profiles = await list(store, "profiles/"),
              joined = await list(store, "mail-members/");
            const members = [
              ...new Map(
                [...profiles, ...joined].map((p) => {
                  const m = memberView(p);
                  return [m.id, m];
                }),
              ).values(),
            ].filter((m) => m.id && m.id !== uid);
            const blocks = (await list(store, `mail-blocks/${uid}/`))
              .filter((b) => b.blocked)
              .map((b) => b.id);
            return json({ members, blocks });
          }
          if (view !== "mailbox") fail("unknown_view");
          const refs = await list(store, `mail-refs/${uid}/`);
          const messages = [];
          for (const ref of refs) {
            const m = await get(store, `mail-messages/${ref.id}.json`);
            if (m && (m.fromId === uid || m.toId === uid)) messages.push(m);
          }
          const items = [];
          for (const m of messages) {
            const state =
              (await get(store, `mail-state/${uid}/${m.id}.json`)) || {};
            const { fingerprint, ...publicMessage } = m;
            if (!state.deleted)
              items.push({
                ...publicMessage,
                folder: state.trash
                  ? "trash"
                  : m.fromId === uid
                    ? "sent"
                    : "inbox",
                unread: m.toId === uid && !state.read,
              });
          }
          items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          return json({ messages: items });
        }
        if (view === "topics") {
          const topics = (await list(store, "topics/")).filter(
            (t) => !t.hidden,
          );
          const rows = [];
          for (const topic of topics) {
            const replies = (
              await list(store, `topic-replies/${topic.id}/`)
            ).filter((r) => !r.hidden);
            const last =
              replies
                .map((r) => r.createdAt)
                .sort()
                .at(-1) || topic.createdAt;
            rows.push({
              ...topicView(topic),
              replyCount: replies.length,
              lastActivityAt: last,
            });
          }
          rows.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
          return json({ topics: rows, categories });
        }
        if (view === "topic") {
          const topic = await get(
            store,
            `topics/${id(url.searchParams.get("id"))}.json`,
          );
          if (!topic || topic.hidden) fail("not_found", 404);
          const replies = (
            await list(store, `topic-replies/${topic.id}/`)
          ).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          return json({
            topic: topicView(topic),
            replies: replies.map(replyView),
          });
        }
        fail("unknown_view");
      }
      if (!uid) fail("login_required", 401);
      try {
        verifyOrigin(request);
      } catch {
        fail("invalid_origin", 403);
      }
      if (!request.headers.get("content-type")?.includes("application/json"))
        fail("invalid_json");
      if (Number(request.headers.get("content-length")) > 24000)
        fail("too_large", 413);
      const raw = await request.text();
      if (Buffer.byteLength(raw) > 24000) fail("too_large", 413);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        fail("invalid_json");
      }
      if (!body || typeof body !== "object") fail("invalid_json");
      const user = await liveUser(uid);
      if (
        !user ||
        (user.banned_until && Date.parse(user.banned_until) > Date.now())
      )
        fail("forbidden", 403);
      const roles =
        user.roles || user.app_metadata?.roles || user.appMetadata?.roles || [];
      const admin =
        Array.isArray(roles) &&
        roles.some((r) => String(r).toLowerCase() === "admin");
      const meta = user.user_metadata || user.userMetadata || {};
      const name = String(
        meta.display_name || meta.full_name || "Membre",
      ).slice(0, 40);
      const action = body.action;
      if (mail) {
        if (action === "join") {
          await store.setJSON(`mail-members/${uid}.json`, { id: uid, name });
          return json({ ok: true });
        }
        if (action === "block") {
          const target = id(body.targetId);
          if (target === uid || typeof body.blocked !== "boolean")
            fail("invalid_target");
          await store.setJSON(`mail-blocks/${uid}/${target}.json`, {
            id: target,
            blocked: body.blocked,
          });
          return json({ ok: true });
        }
        if (action === "send") {
          const messageId = `${digest(uid).slice(0, 24)}_${id(body.id)}`,
            attempt = body.id;
          if (!/^[a-f0-9-]{36}$/i.test(attempt)) fail("invalid_id");
          const toId = id(body.toId),
            subject = text(body.subject, 120),
            content = text(body.text, 5000);
          if (toId === uid) fail("invalid_target");
          const value = { toId, subject, text: content };
          const key = `mail-messages/${messageId}.json`,
            existing = await get(store, key);
          if (existing && existing.fingerprint !== digest(value))
            fail("conflict", 409);
          if (!existing) {
            if (
              !(await get(store, `mail-members/${toId}.json`)) &&
              !(await get(store, `profiles/${toId}.json`))
            )
              fail("recipient_unavailable", 404);
            const recipient = await liveUser(toId);
            if (!recipient) fail("recipient_unavailable", 404);
            if (
              (await get(store, `mail-blocks/${toId}/${uid}.json`))?.blocked ||
              (await get(store, `mail-blocks/${uid}/${toId}.json`))?.blocked
            )
              fail("recipient_unavailable", 403);
            await quota(store, uid, "mail", 30);
            const recipientMeta =
              recipient.user_metadata || recipient.userMetadata || {};
            try {
              await put(
                store,
                key,
                {
                  id: messageId,
                  fromId: uid,
                  fromName: name,
                  toName: String(
                    recipientMeta.display_name ||
                      recipientMeta.full_name ||
                      "Membre",
                  ).slice(0, 40),
                  ...value,
                  fingerprint: digest(value),
                  createdAt: new Date().toISOString(),
                },
                null,
              );
            } catch (error) {
              const saved = await get(store, key);
              if (error.status !== 409 || saved?.fingerprint !== digest(value))
                throw error;
            }
          }
          // Repair either reference on retry if a previous response failed mid-delivery.
          await store.setJSON(`mail-refs/${uid}/${messageId}.json`, {
            id: messageId,
          });
          await store.setJSON(`mail-refs/${toId}/${messageId}.json`, {
            id: messageId,
          });
          return json({ ok: true, id: messageId });
        }
        if (["read", "unread", "trash", "restore", "delete"].includes(action)) {
          const messageId = id(body.id),
            message = await get(store, `mail-messages/${messageId}.json`);
          if (!message || (message.fromId !== uid && message.toId !== uid))
            fail("not_found", 404);
          const key = `mail-state/${uid}/${messageId}.json`,
            old = await record(store, key),
            state = old?.data || {};
          if (action === "delete" && !state.trash) fail("trash_required");
          if (action === "read" || action === "unread")
            state.read = action === "read";
          if (action === "trash" || action === "restore")
            state.trash = action === "trash";
          if (action === "delete") state.deleted = true;
          await put(store, key, state, old);
          return json({ ok: true });
        }
        fail("unknown_action");
      }
      if (action === "create_topic" || action === "reply_topic") {
        const itemId = id(body.id),
          content = text(body.text, action === "create_topic" ? 2000 : 1200);
        const topicId = action === "create_topic" ? itemId : id(body.topicId);
        const key =
          action === "create_topic"
            ? `topics/${itemId}.json`
            : `topic-replies/${topicId}/${itemId}.json`;
        const payload = {
          text: content,
          ...(action === "create_topic"
            ? { title: text(body.title, 90), category: body.category }
            : { topicId }),
        };
        if (action === "create_topic" && !categories.includes(body.category))
          fail("invalid_category");
        const existing = await get(store, key);
        if (existing) {
          if (
            existing.authorId !== uid ||
            existing.fingerprint !== digest(payload)
          )
            fail("conflict", 409);
          return json({ ok: true, id: itemId });
        }
        if (action === "reply_topic") {
          const topic = await get(store, `topics/${topicId}.json`);
          if (!topic || topic.hidden) fail("not_found", 404);
          if (topic.locked) fail("topic_locked", 403);
        }
        await quota(store, uid, action, action === "create_topic" ? 10 : 60);
        await put(
          store,
          key,
          {
            id: itemId,
            ...payload,
            authorId: uid,
            authorName: name,
            createdAt: new Date().toISOString(),
            fingerprint: digest(payload),
          },
          null,
        );
        return json({ ok: true, id: itemId });
      }
      if (action === "moderate") {
        if (!admin) fail("admin_required", 403);
        const topicId = id(body.topicId),
          replyId = body.replyId ? id(body.replyId) : null;
        const key = replyId
          ? `topic-replies/${topicId}/${replyId}.json`
          : `topics/${topicId}.json`;
        const old = await record(store, key);
        if (!old) fail("not_found", 404);
        if (
          !["hide", "lock", "unlock"].includes(body.operation) ||
          (replyId && body.operation !== "hide")
        )
          fail("invalid_action");
        const updated = { ...old.data, moderatedBy: uid };
        if (body.operation === "hide") updated.hidden = true;
        else updated.locked = body.operation === "lock";
        await put(store, key, updated, old);
        return json({ ok: true });
      }
      fail("unknown_action");
    } catch (error) {
      return json(
        { error: error.status ? error.message : "service_unavailable" },
        error.status || 503,
      );
    }
  };
}
