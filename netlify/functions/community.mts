import { admin, getUser, verifyRequestOrigin } from "@netlify/identity";
import type { Config } from "@netlify/functions";
import { communityStore } from "./_shared/community-store.mts";
import { createCommunityHandler } from "./_shared/community.mjs";
export default createCommunityHandler({
  getUser,
  liveUser: (id: string) => admin.getUser(id),
  verifyOrigin: verifyRequestOrigin,
  getStore: communityStore,
});
export const config: Config = { path: ["/api/aq-mail", "/api/forums"] };
