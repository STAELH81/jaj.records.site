import { getUser, refreshSession } from "@netlify/identity";

/**
 * Return the current Netlify Identity user while also giving an expired
 * access token a chance to recover from nf_refresh.
 *
 * Server-side getUser() validates the current nf_jwt as-is. When that token
 * expires, it can return null even though the browser still has a valid
 * refresh cookie. refreshSession() renews the cookies through the Netlify
 * runtime, after which getUser() can resolve the same account again.
 */
export async function getSessionUser() {
  try {
    await refreshSession();
  } catch {
    // No session / invalid refresh token: getUser() below will return null.
  }

  return await getUser();
}
