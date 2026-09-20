import { fixture } from "./publisher-fixture.mjs";
import { createCommunityHandler } from "../netlify/functions/_shared/community.mjs";
export function communityFixture() {
  const f = fixture();
  const users = {
    alice: {
      id: "alice",
      roles: ["user"],
      user_metadata: { display_name: "Alice" },
    },
    bob: { id: "bob", roles: ["user"], user_metadata: { display_name: "Bob" } },
    eve: { id: "eve", roles: ["user"], user_metadata: { display_name: "Eve" } },
    admin: {
      id: "admin",
      roles: ["admin"],
      user_metadata: { display_name: "Admin" },
    },
  };
  f.identity.user = users.alice;
  const handler = createCommunityHandler({
    ...f.deps,
    liveUser: async (id) => users[id] || null,
  });
  return {
    ...f,
    users,
    handler,
    call: (path = "/api/aq-mail", body = null, origin = "https://site.test") =>
      handler(
        new Request(`https://site.test${path}`, {
          method: body ? "POST" : "GET",
          headers: { origin, "content-type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        {},
      ),
  };
}
