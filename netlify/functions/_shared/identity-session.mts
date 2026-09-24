import { admin, getUser, refreshSession } from "@netlify/identity";

function userIdFromAccessToken(token: string | null) {
  if (!token) return "";
  try {
    const segment = token.split(".")[1];
    if (!segment) return "";
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded));
    return String(payload?.sub || payload?.user_id || "").trim();
  } catch {
    return "";
  }
}

/**
 * Resolve the current Identity user without turning a normal token refresh
 * into a one-request logout.
 *
 * refreshSession() writes refreshed cookies on the response, but the current
 * request still contains the old cookie. If we immediately call getUser()
 * again in the same invocation, that call can still return null. When refresh
 * succeeds we use the returned access token to resolve the same live Identity
 * user for the current request, while the browser receives the fresh cookies
 * for following requests.
 */
export async function getSessionUser() {
  const current = await getUser();
  if (current) return current;

  try {
    const token = await refreshSession();
    const userId = userIdFromAccessToken(token);

    if (userId) {
      try {
        return await admin.getUser(userId);
      } catch {
        // Fall through to a final normal lookup.
      }
    }

    return await getUser();
  } catch {
    return null;
  }
}
