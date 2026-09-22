import { getDeployStore, getStore } from "@netlify/blobs";
import { admin, getUser, verifyRequestOrigin } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

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

function getSupabaseAdmin() {
  const url = Netlify.env.get("SUPABASE_URL");
  const secret = Netlify.env.get("SUPABASE_SECRET_KEY");

  if (!url || !secret) {
    throw new Error("supabase_not_configured");
  }

  return createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
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

  const profile = {
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

  if (!saved) {
    await store.setJSON(`profiles/${sessionUser.id}.json`, profile);
  }

  return profile;
}

async function listJSON(store: any, prefix: string) {
  const listed = await store.list({ prefix });
  const values = await Promise.all(
    listed.blobs.map((item: any) => store.get(item.key, { type: "json" }))
  );
  return values.filter(Boolean);
}

function friendshipId(userA: unknown, userB: unknown) {
  const a = safeId(userA);
  const b = safeId(userB);
  if (!a || !b || a === b) return "";
  return [a, b].sort().join("__");
}

async function getFriendship(store: any, userA: unknown, userB: unknown) {
  const id = friendshipId(userA, userB);
  if (!id) return null;
  return await store.get(`friendships/${id}.json`, { type: "json" });
}

async function publicIdentity(store: any, user: any) {
  const saved = await store.get(`profiles/${user.id}.json`, { type: "json" });
  const meta = identityMetadata(user);

  return {
    userId: user.id,
    displayName: cleanSingleLine(
      saved?.displayName ||
        meta.display_name ||
        meta.full_name ||
        user.email?.split("@")[0] ||
        "Utilisateur",
      40,
    ),
    aquertyMail: cleanSingleLine(
      saved?.aquertyMail || fallbackAquertyMail(user),
      120,
    ),
    roles: normalizeRoles(user.roles),
  };
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

function isAdminProfile(profile: any) {
  return Array.isArray(profile?.roles) && profile.roles.includes("admin");
}

async function createTopicRecord(store: any, author: any, titleValue: unknown, textValue: unknown, requestedBy?: any) {
  const title = cleanSingleLine(titleValue, 90);
  const text = cleanText(textValue, 2000);
  if (!title || !text) throw new Error("invalid_topic");

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const source = requestedBy || author;

  const topic = {
    id,
    title,
    text,
    authorId: source.userId || source.authorId,
    authorName: source.displayName || source.authorName || "Utilisateur",
    authorMail: source.aquertyMail || source.authorMail || "",
    authorRoles: Array.isArray(source.roles) ? source.roles : (source.authorRoles || []),
    createdAt,
    lastActivityAt: createdAt,
    replyCount: 0,
    approvedBy: requestedBy ? author.userId : null,
  };

  await store.setJSON(`topics/${id}.json`, topic);
  return topic;
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

    if (view === "forum_requests") {
      if (!sessionUser) return json({ error: "login_required" }, { status: 401 });
      const viewer = await profileForUser(store, sessionUser);
      if (!isAdminProfile(viewer)) return json({ error: "admin_required" }, { status: 403 });

      const requests = await listJSON(store, "forum-requests/");
      requests.sort((a: any, b: any) => String(a?.createdAt || "").localeCompare(String(b?.createdAt || "")));
      return json({ requests });
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

    if (view === "friend_requests") {
      if (!sessionUser) {
        return json({ error: "login_required" }, { status: 401 });
      }

      const requests = await listJSON(
        store,
        `friend-requests/${sessionUser.id}/`,
      );

      requests.sort((a: any, b: any) =>
        String(b?.createdAt || "").localeCompare(String(a?.createdAt || ""))
      );

      return json({ requests });
    }

    if (view === "chat_contacts") {
      if (!sessionUser) {
        return json({ error: "login_required" }, { status: 401 });
      }

      const friendships = await listJSON(store, "friendships/");
      const friendIds = new Set<string>();

      friendships.forEach((friendship: any) => {
        const users = Array.isArray(friendship?.users) ? friendship.users : [];
        if (!users.includes(sessionUser.id)) return;

        users.forEach((id: string) => {
          if (id && id !== sessionUser.id) friendIds.add(id);
        });
      });

      const contacts = (
        await Promise.all(
          [...friendIds].map(async (userId) => {
            try {
              const user = await admin.getUser(userId);
              return await publicIdentity(store, user);
            } catch (error) {
              console.warn("[AQ MySpace] friend Identity lookup failed", userId, error);
              return null;
            }
          }),
        )
      )
        .filter(Boolean)
        .sort((a: any, b: any) =>
          String(a.displayName).localeCompare(String(b.displayName))
        );

      return json({ contacts });
    }

    if (view === "messages") {
      if (!sessionUser) {
        return json({ error: "login_required" }, { status: 401 });
      }

      const peerId = safeId(url.searchParams.get("with"));

      if (!peerId) {
        return json({ error: "invalid_peer" }, { status: 400 });
      }

      const friendship = await getFriendship(store, sessionUser.id, peerId);
      if (!friendship) {
        return json({ error: "friends_required" }, { status: 403 });
      }

      const supabase = getSupabaseAdmin();

      const { error: readError } = await supabase
        .from("myspace_messages")
        .update({
          read_at: new Date().toISOString(),
        })
        .eq("sender_id", peerId)
        .eq("recipient_id", sessionUser.id)
        .is("read_at", null);

      if (readError) {
        console.warn(
          "[AQ MySpace] unable to mark messages as read",
          readError,
        );
      }

      const [sentResult, receivedResult] = await Promise.all([
        supabase
          .from("myspace_messages")
          .select("id,sender_id,recipient_id,body,created_at,read_at")
          .eq("sender_id", sessionUser.id)
          .eq("recipient_id", peerId)
          .order("created_at", { ascending: true })
          .limit(300),
        supabase
          .from("myspace_messages")
          .select("id,sender_id,recipient_id,body,created_at,read_at")
          .eq("sender_id", peerId)
          .eq("recipient_id", sessionUser.id)
          .order("created_at", { ascending: true })
          .limit(300),
      ]);

      if (sentResult.error || receivedResult.error) {
        console.error(
          "[AQ MySpace] message fetch failed",
          sentResult.error || receivedResult.error,
        );

        return json(
          { error: "messages_unavailable" },
          { status: 500 },
        );
      }

      const messages = [
        ...(sentResult.data || []),
        ...(receivedResult.data || []),
      ]
        .sort((a: any, b: any) =>
          String(a.created_at || "").localeCompare(String(b.created_at || ""))
        )
        .slice(-300);

      return json({ messages });
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

  if (action === "send_friend_request") {
    const targetMail = cleanSingleLine(body.aquertyMail, 120).toLowerCase();

    if (!targetMail || !targetMail.endsWith("@aquerty.fr")) {
      return json({ error: "invalid_aquerty_mail" }, { status: 400 });
    }

    const [users, profiles] = await Promise.all([
      admin.listUsers(),
      listJSON(store, "profiles/"),
    ]);

    const profileByUserId = new Map(
      profiles
        .filter((profile: any) => profile?.userId)
        .map((profile: any) => [profile.userId, profile]),
    );

    const recipient = users.find((user: any) => {
      if (!user?.id) return false;
      const saved = profileByUserId.get(user.id);
      const mail = cleanSingleLine(
        saved?.aquertyMail || fallbackAquertyMail(user),
        120,
      ).toLowerCase();
      return mail === targetMail;
    });

    if (!recipient) {
      return json({ error: "friend_user_not_found" }, { status: 404 });
    }

    if (recipient.id === sessionUser.id) {
      return json({ error: "cannot_friend_self" }, { status: 400 });
    }

    if (await getFriendship(store, sessionUser.id, recipient.id)) {
      return json({ error: "already_friends" }, { status: 409 });
    }

    const [outgoing, incoming] = await Promise.all([
      listJSON(store, `friend-requests/${recipient.id}/`),
      listJSON(store, `friend-requests/${sessionUser.id}/`),
    ]);

    if (outgoing.some((item: any) => item?.senderId === sessionUser.id)) {
      return json({ error: "friend_request_already_pending" }, { status: 409 });
    }

    if (incoming.some((item: any) => item?.senderId === recipient.id)) {
      return json({ error: "incoming_friend_request_exists" }, { status: 409 });
    }

    const recipientIdentity = await publicIdentity(store, recipient);
    const id = crypto.randomUUID();
    const requestRecord = {
      id,
      senderId: sessionUser.id,
      senderName: author.displayName,
      senderMail: author.aquertyMail,
      recipientId: recipient.id,
      recipientName: recipientIdentity.displayName,
      recipientMail: recipientIdentity.aquertyMail,
      createdAt: new Date().toISOString(),
    };

    await store.setJSON(
      `friend-requests/${recipient.id}/${id}.json`,
      requestRecord,
    );

    return json({ ok: true, request: requestRecord });
  }

  if (action === "respond_friend_request") {
    const requestId = safeId(body.requestId);
    const decision = String(body.decision || "");

    if (!requestId || !["accept", "reject"].includes(decision)) {
      return json({ error: "invalid_friend_response" }, { status: 400 });
    }

    const key = `friend-requests/${sessionUser.id}/${requestId}.json`;
    const requestRecord = await store.get(key, { type: "json" });

    if (!requestRecord) {
      return json({ error: "friend_request_not_found" }, { status: 404 });
    }

    if (decision === "accept") {
      const id = friendshipId(sessionUser.id, requestRecord.senderId);
      if (!id) {
        return json({ error: "invalid_friendship" }, { status: 400 });
      }

      await store.setJSON(`friendships/${id}.json`, {
        id,
        users: [sessionUser.id, requestRecord.senderId].sort(),
        acceptedAt: new Date().toISOString(),
        requestId,
      });
    }

    await store.delete(key);

    return json({
      ok: true,
      decision,
      senderId: requestRecord.senderId,
    });
  }

  if (action === "send_message") {
    const recipientId = safeId(body.recipientId);
    const text = cleanText(body.text, 2000);

    if (
      !recipientId ||
      !text ||
      recipientId === sessionUser.id
    ) {
      return json(
        { error: "invalid_message" },
        { status: 400 },
      );
    }

    try {
      await admin.getUser(recipientId);
    } catch {
      return json(
        { error: "recipient_not_found" },
        { status: 404 },
      );
    }

    const friendship = await getFriendship(store, sessionUser.id, recipientId);
    if (!friendship) {
      return json({ error: "friends_required" }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("myspace_messages")
      .insert({
        sender_id: sessionUser.id,
        recipient_id: recipientId,
        body: text,
      })
      .select(
        "id,sender_id,recipient_id,body,created_at,read_at"
      )
      .single();

    if (error) {
      console.error(
        "[AQ MySpace] message insert failed",
        error,
      );

      const isPreview = Netlify?.context?.deploy?.context !== "production";

      return json(
        {
          error: isPreview
            ? `message_send_failed:${error.code || "unknown"}:${error.message || "unknown"}`
            : "message_send_failed",
        },
        { status: 500 },
      );
    }

    return json({
      ok: true,
      message: data,
    });
  }

  if (action === "save_profile") {
    const profile = {
      ...author,
      displayName: cleanSingleLine(body.displayName || author.displayName, 40),
      aquertyMail: author.aquertyMail,
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

  if (action === "request_topic") {
    const title = cleanSingleLine(body.title, 90);
    const text = cleanText(body.text, 2000);
    if (!title || !text) return json({ error: "invalid_topic_request" }, { status: 400 });

    const id = crypto.randomUUID();
    const requestRecord = {
      id,
      title,
      text,
      requesterId: author.userId,
      requesterName: author.displayName,
      requesterMail: author.aquertyMail,
      requesterRoles: author.roles,
      createdAt: new Date().toISOString(),
    };

    await store.setJSON(`forum-requests/${id}.json`, requestRecord);
    return json({ ok: true, request: requestRecord });
  }

  if (action === "create_topic") {
    if (!isAdminProfile(author)) return json({ error: "admin_required" }, { status: 403 });

    try {
      const topic = await createTopicRecord(store, author, body.title, body.text);
      return json({ ok: true, topic });
    } catch {
      return json({ error: "invalid_topic" }, { status: 400 });
    }
  }

  if (action === "moderate_topic_request") {
    if (!isAdminProfile(author)) return json({ error: "admin_required" }, { status: 403 });

    const requestId = safeId(body.requestId);
    const decision = String(body.decision || "");
    if (!requestId || !["approve", "reject"].includes(decision)) {
      return json({ error: "invalid_moderation_request" }, { status: 400 });
    }

    const requestRecord = await store.get(`forum-requests/${requestId}.json`, { type: "json" });
    if (!requestRecord) return json({ error: "request_not_found" }, { status: 404 });

    if (decision === "reject") {
      await store.delete(`forum-requests/${requestId}.json`);
      return json({ ok: true, decision: "reject" });
    }

    try {
      const topic = await createTopicRecord(
        store,
        author,
        requestRecord.title,
        requestRecord.text,
        {
          userId: requestRecord.requesterId,
          displayName: requestRecord.requesterName,
          aquertyMail: requestRecord.requesterMail,
          roles: requestRecord.requesterRoles,
        }
      );
      await store.delete(`forum-requests/${requestId}.json`);
      return json({ ok: true, decision: "approve", topic });
    } catch {
      return json({ error: "invalid_topic" }, { status: 400 });
    }
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
