import { admin, getUser, login, logout, signup, verifyRequestOrigin } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";

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

async function liveUser(user: any) {
  if (!user?.id) return user;
  try {
    return await admin.getUser(user.id);
  } catch (error) {
    console.warn("[AQ Auth] live Identity lookup failed", error);
    return user;
  }
}

function serializeUser(user: any) {
  if (!user) return null;
  const metadata = user?.user_metadata || user?.userMetadata || {};
  return {
    id: user.id,
    email: user.email,
    createdAt: user?.createdAt || user?.created_at || user?.confirmedAt || user?.confirmed_at || null,
    roles: normalizeRoles(user?.roles || user?.app_metadata?.roles || user?.appMetadata?.roles),
    user_metadata: {
      full_name: metadata.full_name || metadata.display_name || "",
      display_name: metadata.display_name || metadata.full_name || "",
      aquerty_mail: metadata.aquerty_mail || "",
      aq_avatar: metadata.aq_avatar || "",
    },
  };
}


function cleanDisplayName(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
}

function cleanAvatar(value: unknown) {
  const avatar = String(value ?? "").trim();
  if (!avatar) return "";
  const match = avatar.match(/^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error("invalid_avatar");
  const estimatedBytes = Math.floor(match[2].length * 3 / 4);
  if (estimatedBytes > 160 * 1024) throw new Error("avatar_too_large");
  return avatar;
}

async function requireSessionUser() {
  const sessionUser = await getUser();
  if (!sessionUser) {
    throw Object.assign(new Error("login_required"), { status: 401 });
  }
  return sessionUser;
}

async function verifyCurrentPassword(sessionUser: any, password: unknown) {
  const currentPassword = String(password ?? "");
  const email = String(sessionUser?.email || "").trim();
  if (!email || !currentPassword) {
    throw Object.assign(new Error("current_password_required"), { status: 400 });
  }

  try {
    await login(email, currentPassword);
  } catch {
    throw Object.assign(new Error("current_password_invalid"), { status: 401 });
  }
}

export default async (request: Request, _context: Context) => {
  if (request.method === "GET") {
    const sessionUser = await getUser();
    if (!sessionUser) {
      return json({ authenticated: false, user: null });
    }

    const user = await liveUser(sessionUser);
    return json({ authenticated: true, user: serializeUser(user) });
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

  if (action === "login") {
    const email = String(body?.email || "").trim();
    const password = String(body?.password || "");
    if (!email || !password) {
      return json({ error: "missing_credentials" }, { status: 400 });
    }

    try {
      const sessionUser = await login(email, password);
      const user = await liveUser(sessionUser);
      return json({ ok: true, authenticated: true, user: serializeUser(user) });
    } catch (error: any) {
      return json(
        { error: "login_failed", message: String(error?.message || error || "") },
        { status: 401 },
      );
    }
  }

  if (action === "signup") {
    const email = String(body?.email || "").trim();
    const password = String(body?.password || "");
    const displayName = String(body?.displayName || "").trim();
    const aquertyMail = String(body?.aquertyMail || "").trim();

    if (!email || !password || !displayName) {
      return json({ error: "missing_signup_fields" }, { status: 400 });
    }

    try {
      await signup(email, password, {
        full_name: displayName,
        display_name: displayName,
        aquerty_mail: aquertyMail,
      });

      try {
        const sessionUser = await login(email, password);
        const user = await liveUser(sessionUser);
        return json({ ok: true, authenticated: true, user: serializeUser(user) });
      } catch {
        return json({ ok: true, authenticated: false, requiresConfirmation: true });
      }
    } catch (error: any) {
      return json(
        { error: "signup_failed", message: String(error?.message || error || "") },
        { status: 400 },
      );
    }
  }

  if (action === "update_profile") {
    try {
      const sessionUser = await requireSessionUser();
      const live = await liveUser(sessionUser);
      const metadata = live?.user_metadata || live?.userMetadata || {};
      const displayName = cleanDisplayName(body?.displayName);
      const avatar = cleanAvatar(body?.avatar);

      if (!displayName) {
        return json({ error: "display_name_required" }, { status: 400 });
      }

      const updated = await admin.updateUser(sessionUser.id, {
        user_metadata: {
          ...metadata,
          full_name: displayName,
          display_name: displayName,
          aq_avatar: avatar,
        },
      });

      return json({ ok: true, authenticated: true, user: serializeUser(updated) });
    } catch (error: any) {
      const code = String(error?.message || "profile_update_failed");
      const status = Number(error?.status) || (
        code === "avatar_too_large" ? 413 :
        code === "invalid_avatar" || code === "display_name_required" ? 400 :
        code === "login_required" ? 401 : 400
      );
      return json({ error: code, message: code }, { status });
    }
  }

  if (action === "change_email") {
    try {
      const sessionUser = await requireSessionUser();
      await verifyCurrentPassword(sessionUser, body?.currentPassword);

      const email = String(body?.email || "").trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return json({ error: "invalid_email" }, { status: 400 });
      }

      const updated = await admin.updateUser(sessionUser.id, { email });
      return json({ ok: true, authenticated: true, user: serializeUser(updated) });
    } catch (error: any) {
      const code = String(error?.message || "email_update_failed");
      const status = Number(error?.status) || (code === "current_password_invalid" ? 401 : 400);
      return json({ error: code, message: code }, { status });
    }
  }

  if (action === "change_password") {
    try {
      const sessionUser = await requireSessionUser();
      await verifyCurrentPassword(sessionUser, body?.currentPassword);

      const password = String(body?.password || "");
      if (password.length < 8) {
        return json({ error: "password_too_short" }, { status: 400 });
      }

      const updated = await admin.updateUser(sessionUser.id, { password });
      return json({ ok: true, authenticated: true, user: serializeUser(updated) });
    } catch (error: any) {
      const code = String(error?.message || "password_update_failed");
      const status = Number(error?.status) || (code === "current_password_invalid" ? 401 : 400);
      return json({ error: code, message: code }, { status });
    }
  }

  if (action === "logout") {
    try {
      await logout();
    } catch (error) {
      console.warn("[AQ Auth] logout warning", error);
    }
    return json({ ok: true, authenticated: false });
  }

  return json({ error: "unknown_action" }, { status: 400 });
};

export const config: Config = {
  path: "/api/aq-auth",
};
