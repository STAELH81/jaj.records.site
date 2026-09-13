import { getDeployStore, getStore } from "@netlify/blobs";
import { admin, getUser, verifyRequestOrigin } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";

declare const Netlify: any;

const STORE_NAME = "aq-myspace-v1";
const POST_LIMIT = 30;
const TOPIC_LIMIT = 40;
const ALLOWED_REACTIONS = new Set(["like", "heart", "fire"]);

function getMyspaceStore() {
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

function cleanText(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, max);
}

function cleanSingleLine(value: unknown, max: number) {
  return cleanText(value, max).replace(/\s+/g, " ");
}

function safeId(value: unknown) {
  const id = String(value ?? "");
  return /^[a-zA-Z0-9_-]{1,120}$/.test(id) ? id : "";
}

async function liveIdentity(sessionUser: any) {
  try {
    return await admin.getUser(sessionUser.id);
  } catch (error) {
    console.warn("[AQ MySpace] live Identity lookup failed", error);
    return sessionUser;
  }
}

function identityMetadata(user: any) {
  return user?.user_metadata || user?.userMetadata || {};
}

function fallbackAquertyMail(user: any) {
  const meta = identityMetadata(user);
  if (meta.aquerty_mail) return cleanSingleLine(meta.aquerty_mail, 120);
  const base = cleanSingleLine(user?.email?.split("@")[0] || "user", 48)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ".");
  return `${base || "user"}@aquerty.fr`;
}

async function profileForUser(store: any, sessionUser: any) {
  const live = await liveIdentity(sessionUser);
  const saved = await store.get(`profiles/${sessionUser.id}.json`, { type: "json" });
  const meta = identityMetadata(live);

  return {
    userId: sessionUser.id,
    displayName: cleanSingleLine(
      saved?.displayName || meta.display_name || meta.full_name || sessionUser.email?.split("@")[0] || "Utilisateur",
      40
    ),
    aquertyMail: cleanSingleLine(saved?.aquertyMail || fallbackAquertyMail(live), 120),
    headline: cleanSingleLine(saved?.headline || "", 100),
    bio: cleanText(saved?.bio || "", 700),
    location: cleanSingleLine(saved?.location || "", 80),
    favoriteMusic: cleanSingleLine(saved?.favoriteMusic || "", 180),
    roles: normalizeRoles(live?.roles),
    updatedAt: saved?.updatedAt || null,
  };
}

async function listJSON(store: any, prefix: string) {
  const listed = await store.list({ prefix });
  const values = await Promise.all(
    listed.blobs.map((item: any) => store.get(item.key, { type: "json" }))
  );
  return values.filter(Boolean);
}

async function reactionSummary(store: any, postId: string, viewerId?: string) {
  const reactions = await listJSON(store, `reactions/${postId}/`);
  const counts = { like: 0, heart: 0, fire: 0 } as Record<string, number>;
  let mine: string | null = null;

  for (const reaction of reactions) {
    const type = String(reaction?.type || "");
    if (type in counts) counts[type] += 1;
    if (viewerId && reaction?.userId === viewerId) mine = type;
  }

  return { counts, mine };
}

async function commentCount(store: any, postId: string) {
  const listed = await store.list({ prefix: `comments/${postId}/` });
  return listed.blobs.length;
}

async function topicReplyCount(store: any, topicId: string) {
  const listed = await store.list({ prefix: `topic-replies/${topicId}/` });
  return listed.blobs.length;
}

export default async (request: Request, _context: Context) => {
  const store = getMyspaceStore();
  const url = new URL(request.url);
  const sessionUser = await getUser();

  if (request.method === "GET") {
    const view = url.searchParams.get("view") || "feed";

    if (view === "feed") {
      const posts = await listJSON(store, "posts/");
      posts.sort((a: any, b: any) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")));
      const selected = posts.slice(0, POST_LIMIT);

      const hydrated = await Promise.all(selected.map(async (post: any) => {
        const reactions = await reactionSummary(store, post.id, sessionUser?.id);
        const comments = await commentCount(store, post.id);
        return { ...post, reactions: reactions.counts, myReaction: reactions.mine, commentCount: comments };
      }));

      return json({ posts: hydrated });
    }

    if (view === "profile") {
      const userId = safeId(url.searchParams.get("userId") || sessionUser?.id);
      if (!userId) return json({ error: "missing_user_id" }, { status: 400 });

      const saved = await store.get(`profiles/${userId}.json`, { type: "json" });
      if (!saved && sessionUser?.id === userId) {
        return json({ profile: await profileForUser(store, sessionUser) });
      }
      return json({ profile: saved || null });
    }

    if (view === "comments") {
      const postId = safeId(url.searchParams.get("postId"));
      if (!postId) return json({ error: "invalid_post_id" }, { status: 400 });
      const comments = await listJSON(store, `comments/${postId}/`);
      comments.sort((a: any, b: any) => String(a?.createdAt || "").localeCompare(String(b?.createdAt || "")));
      return json({ comments });
    }

    if (view === "topics") {
      const topics = await listJSON(store, "topics/");
      topics.sort((a: any, b: any) => String(b?.lastActivityAt || b?.createdAt || "").localeCompare(String(a?.lastActivityAt || a?.createdAt || "")));
      return json({ topics: topics.slice(0, TOPIC_LIMIT) });
    }

    if (view === "topic") {
      const topicId = safeId(url.searchParams.get("topicId"));
      if (!topicId) return json({ error: "invalid_topic_id" }, { status: 400 });
      const topic = await store.get(`topics/${topicId}.json`, { type: "json" });
      if (!topic) return json({ error: "topic_not_found" }, { status: 404 });
      const replies = await listJSON(store, `topic-replies/${topicId}/`);
      replies.sort((a: any, b: any) => String(a?.createdAt || "").localeCompare(String(b?.createdAt || "")));
      return json({ topic: { ...topic, replyCount: replies.length }, replies });
    }

    return json({ error: "unknown_view" }, { status: 400 });
  }

  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, {
      status: 405,
      headers: { Allow: "GET, POST" },
    });
  }

  if (!sessionUser) {
    return json({ error: "login_required" }, { status: 401 });
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
  const author = await profileForUser(store, sessionUser);

  if (action === "save_profile") {
    const profile = {
      ...author,
      displayName: cleanSingleLine(body.displayName || author.displayName, 40),
      aquertyMail: cleanSingleLine(body.aquertyMail || author.aquertyMail, 120),
      headline: cleanSingleLine(body.headline, 100),
      bio: cleanText(body.bio, 700),
      location: cleanSingleLine(body.location, 80),
      favoriteMusic: cleanSingleLine(body.favoriteMusic, 180),
      updatedAt: new Date().toISOString(),
    };

    await store.setJSON(`profiles/${sessionUser.id}.json`, profile);
    return json({ ok: true, profile });
  }

  if (action === "create_post") {
    const text = cleanText(body.text, 800);
    if (!text) return json({ error: "empty_post" }, { status: 400 });

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const post = {
      id,
      authorId: sessionUser.id,
      authorName: author.displayName,
      authorMail: author.aquertyMail,
      authorRoles: author.roles,
      text,
      createdAt,
    };

    await store.setJSON(`posts/${id}.json`, post);
    return json({
      ok: true,
      post: {
        ...post,
        reactions: { like: 0, heart: 0, fire: 0 },
        myReaction: null,
        commentCount: 0,
      },
    });
  }

  if (action === "comment") {
    const postId = safeId(body.postId);
    const text = cleanText(body.text, 400);
    if (!postId || !text) return json({ error: "invalid_comment" }, { status: 400 });

    const post = await store.get(`posts/${postId}.json`, { type: "json" });
    if (!post) return json({ error: "post_not_found" }, { status: 404 });

    const id = crypto.randomUUID();
    const comment = {
      id,
      postId,
      authorId: sessionUser.id,
      authorName: author.displayName,
      authorMail: author.aquertyMail,
      authorRoles: author.roles,
      text,
      createdAt: new Date().toISOString(),
    };

    await store.setJSON(`comments/${postId}/${id}.json`, comment);
    return json({ ok: true, comment, commentCount: await commentCount(store, postId) });
  }

  if (action === "react") {
    const postId = safeId(body.postId);
    const type = String(body.type || "");
    if (!postId || !ALLOWED_REACTIONS.has(type)) {
      return json({ error: "invalid_reaction" }, { status: 400 });
    }

    const post = await store.get(`posts/${postId}.json`, { type: "json" });
    if (!post) return json({ error: "post_not_found" }, { status: 404 });

    const key = `reactions/${postId}/${sessionUser.id}.json`;
    const existing = await store.get(key, { type: "json" });

    if (existing?.type === type) {
      await store.delete(key);
    } else {
      await store.setJSON(key, {
        postId,
        userId: sessionUser.id,
        type,
        updatedAt: new Date().toISOString(),
      });
    }

    const summary = await reactionSummary(store, postId, sessionUser.id);
    return json({ ok: true, reactions: summary.counts, myReaction: summary.mine });
  }

  if (action === "create_topic") {
    const title = cleanSingleLine(body.title, 90);
    const text = cleanText(body.text, 2000);
    if (!title || !text) return json({ error: "invalid_topic" }, { status: 400 });

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const topic = {
      id,
      title,
      text,
      authorId: sessionUser.id,
      authorName: author.displayName,
      authorMail: author.aquertyMail,
      authorRoles: author.roles,
      createdAt,
      lastActivityAt: createdAt,
      replyCount: 0,
    };

    await store.setJSON(`topics/${id}.json`, topic);
    return json({ ok: true, topic });
  }

  if (action === "reply_topic") {
    const topicId = safeId(body.topicId);
    const text = cleanText(body.text, 1200);
    if (!topicId || !text) return json({ error: "invalid_reply" }, { status: 400 });

    const topic = await store.get(`topics/${topicId}.json`, { type: "json" });
    if (!topic) return json({ error: "topic_not_found" }, { status: 404 });

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const reply = {
      id,
      topicId,
      authorId: sessionUser.id,
      authorName: author.displayName,
      authorMail: author.aquertyMail,
      authorRoles: author.roles,
      text,
      createdAt,
    };

    await store.setJSON(`topic-replies/${topicId}/${id}.json`, reply);
    const replyCount = await topicReplyCount(store, topicId);
    await store.setJSON(`topics/${topicId}.json`, {
      ...topic,
      replyCount,
      lastActivityAt: createdAt,
    });

    return json({ ok: true, reply, replyCount });
  }

  return json({ error: "unknown_action" }, { status: 400 });
};

export const config: Config = {
  path: "/api/myspace",
};
