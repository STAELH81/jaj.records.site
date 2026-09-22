import { getDeployStore, getStore } from "@netlify/blobs";
import { admin, getUser, verifyRequestOrigin } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

declare const Netlify: any;

const STORE_NAME = "aq-myspace-v1";
const POST_LIMIT = 30;
const TOPIC_LIMIT = 40;
const ALLOWED_REACTIONS = new Set(["like", "heart", "fire"]);
const PROFILE_STYLES = new Set(["blue", "orange", "purple", "green", "black"]);
const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const WALL_COMMENT_LIMIT = 30;
const DEFAULT_FORUMS = [
  {
    id: "default-general",
    title: "Général",
    titleEn: "General",
    text: "Le forum pour parler de tout ce qui ne rentre pas ailleurs sur AQ-NET.",
    textEn: "The forum for everything that does not fit elsewhere on AQ-NET."
  },
  {
    id: "default-gaming",
    title: "Jeux vidéo",
    titleEn: "Gaming",
    text: "Jeux PC, consoles, indés, mods, serveurs et découvertes.",
    textEn: "PC games, consoles, indies, mods, servers and discoveries."
  },
  {
    id: "default-music",
    title: "Musique",
    titleEn: "Music",
    text: "Sorties, production, artistes, matériel, playlists et recommandations.",
    textEn: "Releases, production, artists, gear, playlists and recommendations."
  },
  {
    id: "default-sports",
    title: "Sport",
    titleEn: "Sports",
    text: "Matchs, compétitions, pratique, résultats et discussions sportives.",
    textEn: "Matches, competitions, training, results and sports discussion."
  },
  {
    id: "default-tech",
    title: "Tech & Internet",
    titleEn: "Tech & Internet",
    text: "PC, réseaux, logiciels, web, bidouilles et actualité tech.",
    textEn: "PCs, networks, software, web, tinkering and tech news."
  }
];

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

function cleanAvatarData(value: unknown) {
  const avatar = String(value ?? "").trim();
  if (!avatar) return "";
  const match = avatar.match(/^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error("invalid_avatar");
  const estimatedBytes = Math.floor(match[2].length * 3 / 4);
  if (estimatedBytes > 1024 * 1024) throw new Error("avatar_too_large");
  return avatar;
}

function cleanProfileStyle(value: unknown) {
  const style = String(value ?? "").trim().toLowerCase();
  return PROFILE_STYLES.has(style) ? style : "blue";
}

function cleanWebsite(value: unknown) {
  const raw = cleanSingleLine(value, 180);
  if (!raw) return "";

  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("invalid_website");
    return parsed.toString().slice(0, 180);
  } catch {
    throw new Error("invalid_website");
  }
}

function identityCreatedAt(user: any) {
  return cleanSingleLine(
    user?.created_at ||
      user?.createdAt ||
      user?.confirmed_at ||
      user?.confirmedAt ||
      "",
    64,
  );
}

function cleanTopFriendIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map((item) => safeId(item))
      .filter(Boolean),
  )].slice(0, 8);
}

async function presenceForUser(store: any, userId: unknown) {
  const id = safeId(userId);
  if (!id) return { online: false, lastSeenAt: null };

  const record = await store.get(`presence/${id}.json`, { type: "json" });
  const lastSeenAt = record?.lastSeenAt || null;
  const time = lastSeenAt ? Date.parse(lastSeenAt) : NaN;

  return {
    online: Number.isFinite(time) && (Date.now() - time) <= ONLINE_WINDOW_MS,
    lastSeenAt,
  };
}

async function wallCommentsForUser(store: any, userId: string) {
  const comments = await listJSON(store, `profile-comments/${userId}/`);
  comments.sort((a: any, b: any) =>
    String(b?.createdAt || "").localeCompare(String(a?.createdAt || ""))
  );

  const selected = comments.slice(0, WALL_COMMENT_LIMIT).reverse();

  return await Promise.all(
    selected.map(async (comment: any) => ({
      ...comment,
      authorAvatar: await avatarForUser(store, comment.authorId),
    })),
  );
}

async function unreadSummaryForUser(userId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("myspace_messages")
    .select("sender_id,created_at")
    .eq("recipient_id", userId)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw error;

  const bySender: Record<string, number> = {};
  for (const row of data || []) {
    const senderId = String(row?.sender_id || "");
    if (!senderId) continue;
    bySender[senderId] = (bySender[senderId] || 0) + 1;
  }

  return {
    unreadCount: (data || []).length,
    bySender,
  };
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
    mood: cleanSingleLine(saved?.mood || "", 60),
    bio: cleanText(saved?.bio || "", 700),
    location: cleanSingleLine(saved?.location || "", 80),
    interests: cleanSingleLine(saved?.interests || "", 240),
    favoriteMusic: cleanSingleLine(saved?.favoriteMusic || "", 180),
    topArtists: cleanSingleLine(saved?.topArtists || "", 240),
    website: saved?.website ? cleanWebsite(saved.website) : "",
    avatar: saved?.avatar ? cleanAvatarData(saved.avatar) : "",
    profileStyle: cleanProfileStyle(saved?.profileStyle || "blue"),
    profileTrackId: cleanSingleLine(saved?.profileTrackId || "", 120),
    topFriendIds: cleanTopFriendIds(saved?.topFriendIds),
    joinedAt: saved?.joinedAt || identityCreatedAt(live) || new Date().toISOString(),
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

async function friendIdsForUser(store: any, userId: string) {
  const friendships = await listJSON(store, "friendships/");
  const ids = new Set<string>();

  friendships.forEach((friendship: any) => {
    const users = Array.isArray(friendship?.users) ? friendship.users : [];
    if (!users.includes(userId)) return;

    users.forEach((id: string) => {
      if (id && id !== userId) ids.add(id);
    });
  });

  return [...ids];
}

async function friendsForUser(store: any, userId: string) {
  const ids = await friendIdsForUser(store, userId);

  const friends = (
    await Promise.all(
      ids.map(async (friendId) => {
        try {
          const user = await admin.getUser(friendId);
          return await publicIdentity(store, user);
        } catch (error) {
          console.warn("[AQ MySpace] profile friend lookup failed", friendId, error);
          return null;
        }
      }),
    )
  )
    .filter(Boolean)
    .sort((a: any, b: any) =>
      String(a.displayName || "").localeCompare(String(b.displayName || ""))
    );

  return friends;
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
    avatar: saved?.avatar ? cleanAvatarData(saved.avatar) : "",
    website: saved?.website ? cleanWebsite(saved.website) : "",
    joinedAt: saved?.joinedAt || identityCreatedAt(user) || "",
    ...(await presenceForUser(store, user.id)),
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

async function ensureDefaultForums(store: any) {
  const createdAt = "2026-09-01T12:00:00.000Z";
  await Promise.all(DEFAULT_FORUMS.map(async (forum) => {
    const key = `topics/${forum.id}.json`;
    const existing = await store.get(key, { type: "json" });
    if (existing) return;
    await store.setJSON(key, {
      id: forum.id,
      title: forum.title,
      titleEn: forum.titleEn,
      text: forum.text,
      textEn: forum.textEn,
      authorId: "aq-net",
      authorName: "AQ-NET",
      authorMail: "system@aquerty.fr",
      authorRoles: ["admin"],
      createdAt,
      lastActivityAt: createdAt,
      replyCount: 0,
      approvedBy: null,
      defaultForum: true
    });
  }));
}

async function avatarForUser(store: any, userId: unknown) {
  const id = safeId(userId);
  if (!id || id === "aq-net") return "";
  const profile = await store.get(`profiles/${id}.json`, { type: "json" });
  try {
    return profile?.avatar ? cleanAvatarData(profile.avatar) : "";
  } catch {
    return "";
  }
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
        const authorAvatar = await avatarForUser(store, post.authorId);
        return { ...post, authorAvatar, reactions: reactions.counts, myReaction: reactions.mine, commentCount: comments };
      }));

      return json({ posts: hydrated });
    }

    if (view === "profile") {
      const userId = safeId(url.searchParams.get("userId") || sessionUser?.id);
      if (!userId) return json({ error: "missing_user_id" }, { status: 400 });

      let profile = await store.get(`profiles/${userId}.json`, { type: "json" });

      if (!profile && sessionUser?.id === userId) {
        profile = await profileForUser(store, sessionUser);
      } else if (profile) {
        try {
          const live = await admin.getUser(userId);
          profile = {
            ...profile,
            joinedAt: profile.joinedAt || identityCreatedAt(live) || profile.updatedAt || null,
            roles: normalizeRoles(live?.roles),
          };
        } catch {
          profile = {
            ...profile,
            joinedAt: profile.joinedAt || profile.updatedAt || null,
          };
        }
      }

      const friends = profile ? await friendsForUser(store, userId) : [];
      const topFriendIds = cleanTopFriendIds(profile?.topFriendIds);
      const friendById = new Map(friends.map((friend: any) => [friend.userId, friend]));
      const topFriends = topFriendIds
        .map((id) => friendById.get(id))
        .filter(Boolean);
      const displayTopFriends = topFriends.length
        ? topFriends
        : friends.slice(0, 8);
      const wallComments = profile ? await wallCommentsForUser(store, userId) : [];
      const presence = profile
        ? await presenceForUser(store, userId)
        : { online: false, lastSeenAt: null };

      return json({
        profile: profile ? { ...profile, ...presence } : null,
        friends: friends.slice(0, 100),
        topFriends: displayTopFriends,
        topFriendIds,
        friendCount: friends.length,
        wallComments,
      });
    }

    if (view === "comments") {
      const postId = safeId(url.searchParams.get("postId"));
      if (!postId) return json({ error: "invalid_post_id" }, { status: 400 });
      const comments = await listJSON(store, `comments/${postId}/`);
      comments.sort((a: any, b: any) => String(a?.createdAt || "").localeCompare(String(b?.createdAt || "")));
      const hydrated = await Promise.all(comments.map(async (comment: any) => ({
        ...comment,
        authorAvatar: await avatarForUser(store, comment.authorId)
      })));
      return json({ comments: hydrated });
    }

    if (view === "topics") {
      await ensureDefaultForums(store);
      const topics = await listJSON(store, "topics/");
      topics.sort((a: any, b: any) => String(b?.lastActivityAt || b?.createdAt || "").localeCompare(String(a?.lastActivityAt || a?.createdAt || "")));
      const selected = topics.slice(0, TOPIC_LIMIT);
      const hydrated = await Promise.all(selected.map(async (topic: any) => ({
        ...topic,
        authorAvatar: await avatarForUser(store, topic.authorId)
      })));
      return json({ topics: hydrated });
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
      await ensureDefaultForums(store);
      const topic = await store.get(`topics/${topicId}.json`, { type: "json" });
      if (!topic) return json({ error: "topic_not_found" }, { status: 404 });
      const replies = await listJSON(store, `topic-replies/${topicId}/`);
      replies.sort((a: any, b: any) => String(a?.createdAt || "").localeCompare(String(b?.createdAt || "")));
      const hydratedReplies = await Promise.all(replies.map(async (reply: any) => ({
        ...reply,
        authorAvatar: await avatarForUser(store, reply.authorId)
      })));
      return json({
        topic: { ...topic, authorAvatar: await avatarForUser(store, topic.authorId), replyCount: replies.length },
        replies: hydratedReplies
      });
    }

    if (view === "friends") {
      if (!sessionUser) {
        return json({ error: "login_required" }, { status: 401 });
      }

      const [friends, profile] = await Promise.all([
        friendsForUser(store, sessionUser.id),
        profileForUser(store, sessionUser),
      ]);

      return json({
        friends,
        topFriendIds: cleanTopFriendIds(profile.topFriendIds),
      });
    }

    if (view === "chat_summary") {
      if (!sessionUser) {
        return json({ error: "login_required" }, { status: 401 });
      }

      try {
        return json(await unreadSummaryForUser(sessionUser.id));
      } catch (error) {
        console.warn("[AQ MySpace] unread summary failed", error);
        return json({ error: "chat_summary_unavailable" }, { status: 500 });
      }
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

      const contacts = await friendsForUser(store, sessionUser.id);
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

  if (action === "heartbeat") {
    const lastSeenAt = new Date().toISOString();
    await store.setJSON(`presence/${sessionUser.id}.json`, {
      userId: sessionUser.id,
      lastSeenAt,
    });
    return json({ ok: true, lastSeenAt });
  }

  if (action === "save_top_friends") {
    const requested = cleanTopFriendIds(body.friendIds);
    const friendIds = new Set(await friendIdsForUser(store, sessionUser.id));

    if (requested.some((id) => !friendIds.has(id))) {
      return json({ error: "invalid_top_friend" }, { status: 400 });
    }

    const profile = {
      ...author,
      topFriendIds: requested,
      updatedAt: new Date().toISOString(),
    };

    await store.setJSON(`profiles/${sessionUser.id}.json`, profile);
    return json({ ok: true, topFriendIds: requested });
  }

  if (action === "remove_friend") {
    const friendId = safeId(body.friendId);
    if (!friendId || friendId === sessionUser.id) {
      return json({ error: "invalid_friend" }, { status: 400 });
    }

    const id = friendshipId(sessionUser.id, friendId);
    const friendship = id
      ? await store.get(`friendships/${id}.json`, { type: "json" })
      : null;

    if (!id || !friendship) {
      return json({ error: "friendship_not_found" }, { status: 404 });
    }

    await store.delete(`friendships/${id}.json`);

    const selfProfile = {
      ...author,
      topFriendIds: cleanTopFriendIds(author.topFriendIds).filter((value) => value !== friendId),
      updatedAt: new Date().toISOString(),
    };
    await store.setJSON(`profiles/${sessionUser.id}.json`, selfProfile);

    const friendProfile = await store.get(`profiles/${friendId}.json`, { type: "json" });
    if (friendProfile) {
      await store.setJSON(`profiles/${friendId}.json`, {
        ...friendProfile,
        topFriendIds: cleanTopFriendIds(friendProfile.topFriendIds)
          .filter((value) => value !== sessionUser.id),
        updatedAt: new Date().toISOString(),
      });
    }

    return json({ ok: true, friendId });
  }

  if (action === "wall_comment") {
    const targetUserId = safeId(body.targetUserId);
    const text = cleanText(body.text, 500);

    if (!targetUserId || !text) {
      return json({ error: "invalid_wall_comment" }, { status: 400 });
    }

    try {
      await admin.getUser(targetUserId);
    } catch {
      return json({ error: "profile_not_found" }, { status: 404 });
    }

    const id = crypto.randomUUID();
    const comment = {
      id,
      targetUserId,
      authorId: sessionUser.id,
      authorName: author.displayName,
      authorMail: author.aquertyMail,
      authorRoles: author.roles,
      text,
      createdAt: new Date().toISOString(),
    };

    await store.setJSON(
      `profile-comments/${targetUserId}/${id}.json`,
      comment,
    );

    return json({
      ok: true,
      comment: {
        ...comment,
        authorAvatar: author.avatar || "",
      },
    });
  }

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
      mood: cleanSingleLine(body.mood, 60),
      bio: cleanText(body.bio, 700),
      location: cleanSingleLine(body.location, 80),
      interests: cleanSingleLine(body.interests, 240),
      favoriteMusic: cleanSingleLine(body.favoriteMusic, 180),
      topArtists: cleanSingleLine(body.topArtists, 240),
      website: cleanWebsite(body.website),
      avatar: body.avatar !== undefined ? cleanAvatarData(body.avatar) : (author.avatar || ""),
      profileStyle: cleanProfileStyle(body.profileStyle || author.profileStyle || "blue"),
      profileTrackId: cleanSingleLine(body.profileTrackId || author.profileTrackId || "", 120),
      topFriendIds: cleanTopFriendIds(author.topFriendIds),
      joinedAt: author.joinedAt || identityCreatedAt(await liveIdentity(sessionUser)) || new Date().toISOString(),
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
