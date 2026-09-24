import { withMigrationMaintenance } from './_shared/migration-maintenance.mjs';
import { getUser } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";

declare const Netlify: {
  env: {
    get(name: string): string | undefined;
  };
};

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init.headers || {}),
    },
  });
}

function base64url(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encodeText(value: string) {
  return base64url(new TextEncoder().encode(value));
}

async function signJwt(
  payload: Record<string, unknown>,
  secret: string,
) {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const encodedHeader = encodeText(JSON.stringify(header));
  const encodedPayload = encodeText(JSON.stringify(payload));

  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(unsignedToken),
  );

  return `${unsignedToken}.${base64url(new Uint8Array(signature))}`;
}

const migrationGuardedHandler = async (_request: Request, _context: Context) => {
  const sessionUser = await getUser();

  if (!sessionUser?.id) {
    return json({ error: "login_required" }, { status: 401 });
  }

  const secret = Netlify.env.get("SUPABASE_JWT_SECRET");
  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const supabasePublishableKey = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY");

  if (!secret || !supabaseUrl || !supabasePublishableKey) {
    console.error("[AQ MySpace] Supabase chat environment is incomplete");
    return json(
      { error: "server_configuration_error" },
      { status: 500 },
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 5 * 60;

  const token = await signJwt(
    {
      sub: sessionUser.id,
      role: "authenticated",
      aud: "authenticated",
      iat: now,
      exp: expiresAt,
    },
    secret,
  );

  return json({
    token,
    expiresAt: expiresAt * 1000,
    supabaseUrl,
    supabasePublishableKey,
  });
};

export default withMigrationMaintenance(migrationGuardedHandler);

export const config: Config = {
  path: "/api/myspace-chat-token",
};