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
    roles: normalizeRoles(user?.roles || user?.app_metadata?.roles || user?.appMetadata?.roles),
    user_metadata: {
      full_name: metadata.full_name || metadata.display_name || "",
      display_name: metadata.display_name || metadata.full_name || "",
      aquerty_mail: metadata.aquerty_mail || "",
    },
  };
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
