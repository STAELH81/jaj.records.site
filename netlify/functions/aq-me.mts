import { admin } from "@netlify/identity";
import { getSessionUser } from "./_shared/identity-session.mts";
import type { Config, Context } from "@netlify/functions";

function roleList(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map((role) => String(role).trim().toLowerCase()).filter(Boolean))]
    : [];
}

export default async (_request: Request, _context: Context) => {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  let roles = roleList(sessionUser.roles);

  try {
    const liveUser = await admin.getUser(sessionUser.id);
    roles = roleList(liveUser?.roles);
  } catch (error) {
    console.warn("[AQ Identity] live user lookup failed; falling back to session roles", error);
  }

  return Response.json(
    {
      id: sessionUser.id,
      email: sessionUser.email,
      roles
    },
    { headers: { "Cache-Control": "no-store" } }
  );
};

export const config: Config = {
  path: "/api/aq-me"
};
