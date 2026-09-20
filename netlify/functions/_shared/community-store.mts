import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";
declare const Netlify: any;

// Keep the existing production MySpace data; previews persist across branch rebuilds.
export function communityStore(context: Context) {
  const name =
    context.deploy.context === "production"
      ? "aq-myspace-v1"
      : `aq-community-${String(
          Netlify.env.get("BRANCH") || context.deploy.context,
        )
          .replace(/[^a-zA-Z0-9_-]/g, "-")
          .slice(0, 42)}`;
  return getStore({ name, consistency: "strong" });
}
