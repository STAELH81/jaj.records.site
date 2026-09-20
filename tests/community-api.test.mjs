import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { communityFixture } from "./community-fixture.mjs";
async function registered() {
  const f = communityFixture();
  for (const user of Object.values(f.users)) {
    f.identity.user = user;
    assert.equal(
      (await f.call("/api/aq-mail", { action: "join" })).status,
      200,
    );
  }
  f.identity.user = f.users.alice;
  return f;
}
const send = () => ({
  action: "send",
  id: randomUUID(),
  toId: "bob",
  subject: "Hello <script>",
  text: "Private & safe",
  fromId: "eve",
});
test("private delivery, no spoofing, recipient state and third-party isolation", async () => {
  const f = await registered();
  const result = await (await f.call("/api/aq-mail", send())).json();
  const sent = await (await f.call()).json();
  assert.equal(sent.messages.length, 1);
  assert.equal(sent.messages[0].fromId, "alice");
  assert.equal(sent.messages[0].folder, "sent");
  f.identity.user = f.users.eve;
  assert.deepEqual((await (await f.call()).json()).messages, []);
  assert.equal(
    (await f.call("/api/aq-mail", { action: "read", id: result.id })).status,
    404,
  );
  f.identity.user = f.users.bob;
  let inbox = await (await f.call()).json();
  assert.equal(inbox.messages[0].unread, true);
  assert.equal(inbox.messages[0].text, "Private & safe");
  for (const action of ["read", "unread", "trash", "restore"])
    assert.equal(
      (await f.call("/api/aq-mail", { action, id: result.id })).status,
      200,
    );
  assert.equal(
    (await f.call("/api/aq-mail", { action: "delete", id: result.id })).status,
    400,
  );
  await f.call("/api/aq-mail", { action: "trash", id: result.id });
  await f.call("/api/aq-mail", { action: "delete", id: result.id });
  assert.deepEqual((await (await f.call()).json()).messages, []);
  f.identity.user = f.users.alice;
  assert.equal((await (await f.call()).json()).messages.length, 1);
});
test("retry and concurrent sends create a single message; changed payload rejected", async () => {
  const f = await registered(),
    payload = send();
  const responses = await Promise.all([
    f.call("/api/aq-mail", payload),
    f.call("/api/aq-mail", payload),
  ]);
  assert.deepEqual(
    responses.map((r) => r.status),
    [200, 200],
  );
  assert.equal((await (await f.call()).json()).messages.length, 1);
  assert.equal(
    (await f.call("/api/aq-mail", { ...payload, text: "changed" })).status,
    409,
  );
});
test("a failed recipient index write is repaired by the same send retry", async () => {
  const f = await registered(),
    payload = send(),
    write = f.store.setJSON;
  let failed = false;
  f.store.setJSON = async (key, ...args) => {
    if (key.startsWith("mail-refs/bob/") && !failed) {
      failed = true;
      throw new Error("network");
    }
    return write(key, ...args);
  };
  assert.equal((await f.call("/api/aq-mail", payload)).status, 503);
  assert.equal((await f.call("/api/aq-mail", payload)).status, 200);
  f.identity.user = f.users.bob;
  assert.equal((await (await f.call()).json()).messages.length, 1);
  assert.equal(
    [...f.records.keys()].filter((k) => k.startsWith("mail-messages/")).length,
    1,
  );
});
test("guest and origin restrictions, unavailable recipient and blocking", async () => {
  const f = await registered();
  assert.equal(
    (await f.call("/api/aq-mail", send(), "https://evil.test")).status,
    403,
  );
  assert.equal(
    (await f.call("/api/aq-mail", { ...send(), toId: "missing" })).status,
    404,
  );
  f.identity.user = f.users.bob;
  await f.call("/api/aq-mail", {
    action: "block",
    targetId: "alice",
    blocked: true,
  });
  f.identity.user = f.users.alice;
  assert.equal((await f.call("/api/aq-mail", send())).status, 403);
  f.identity.user = f.users.bob;
  await f.call("/api/aq-mail", {
    action: "block",
    targetId: "alice",
    blocked: false,
  });
  f.identity.user = f.users.alice;
  assert.equal((await f.call("/api/aq-mail", send())).status, 200);
  f.identity.user = null;
  assert.equal((await f.call()).status, 401);
  assert.equal((await f.call("/api/forums")).status, 200);
  assert.equal(
    (await f.call("/api/forums", { action: "create_topic" })).status,
    401,
  );
});
test("mail rate limit and validation cannot be bypassed by concurrent requests", async () => {
  const f = await registered();
  const results = await Promise.all(
    Array.from({ length: 34 }, () => f.call("/api/aq-mail", send())),
  );
  assert.equal(results.filter((r) => r.status === 200).length, 30);
  assert.equal(results.filter((r) => r.status === 429).length, 4);
  assert.equal(
    (await f.call("/api/aq-mail", { ...send(), id: "../bad" })).status,
    400,
  );
  assert.equal(
    (await f.call("/api/aq-mail", { ...send(), text: "a".repeat(5001) }))
      .status,
    400,
  );
});
test("members request categorized topics, admins approve, members reply without duplicates", async () => {
  const f = await registered(),
    topicId = randomUUID();
  const payload = {
    action: "create_topic",
    id: topicId,
    category: "sport",
    title: "Football",
    text: "Match ce soir",
    authorName: "Forged",
  };
  assert.equal((await f.call("/api/forums", payload)).status, 403);
  payload.action = "request_topic";
  assert.equal((await f.call("/api/forums", payload)).status, 200);
  assert.equal((await f.call("/api/forums", payload)).status, 200);
  assert.equal((await (await f.call("/api/forums")).json()).topics.length, 0);
  f.identity.user = f.users.bob;
  assert.equal(
    (await (await f.call("/api/forums?view=requests")).json()).requests.length,
    0,
  );
  assert.equal(
    (
      await f.call("/api/forums", {
        action: "moderate_request",
        id: topicId,
        decision: "approve",
      })
    ).status,
    403,
  );
  f.identity.user = null;
  for (const action of [
    "request_topic",
    "create_topic",
    "reply_topic",
    "moderate_request",
  ])
    assert.equal(
      (await f.call("/api/forums", { ...payload, action, topicId })).status,
      401,
    );
  assert.equal((await f.call("/api/forums?view=requests")).status, 401);
  f.identity.user = f.users.admin;
  assert.equal(
    (await (await f.call("/api/forums?view=requests")).json()).requests.length,
    1,
  );
  assert.equal(
    (
      await f.call("/api/forums", {
        action: "moderate_request",
        id: topicId,
        decision: "approve",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await f.call("/api/forums", {
        action: "moderate_request",
        id: topicId,
        decision: "approve",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await f.call("/api/forums", {
        action: "moderate_request",
        id: topicId,
        decision: "reject",
      })
    ).status,
    409,
  );
  f.identity.user = f.users.bob;
  const reply = {
    action: "reply_topic",
    id: randomUUID(),
    topicId,
    text: "Oui !",
  };
  assert.equal((await f.call("/api/forums", reply)).status, 200);
  assert.equal((await f.call("/api/forums", reply)).status, 200);
  f.identity.user = null;
  const topics = await (await f.call("/api/forums")).json();
  assert.equal(topics.topics[0].replyCount, 1);
  assert.equal(topics.topics[0].authorName, "Alice");
  assert.equal(topics.topics[0].category, "sport");
  const detail = await (
    await f.call(`/api/forums?view=topic&id=${topicId}`)
  ).json();
  assert.equal(detail.replies[0].authorName, "Bob");
  assert.equal(detail.topic.authorMail, undefined);
});
test("moderation uses fresh server roles, locking and hiding; legacy topics still readable", async () => {
  const f = await registered(),
    topicId = randomUUID(),
    replyId = randomUUID();
  f.identity.user = f.users.admin;
  await f.call("/api/forums", {
    action: "create_topic",
    id: topicId,
    category: "general",
    title: "Topic",
    text: "Body",
  });
  await f.call("/api/forums", {
    action: "reply_topic",
    id: replyId,
    topicId,
    text: "Reply",
  });
  f.identity.user = { ...f.users.alice, roles: ["admin"] };
  assert.equal(
    (
      await f.call("/api/forums", {
        action: "moderate",
        topicId,
        operation: "lock",
      })
    ).status,
    403,
  );
  f.identity.user = f.users.admin;
  assert.equal(
    (
      await f.call("/api/forums", {
        action: "moderate",
        topicId,
        operation: "lock",
      })
    ).status,
    200,
  );
  f.identity.user = f.users.bob;
  assert.equal(
    (
      await f.call("/api/forums", {
        action: "reply_topic",
        id: randomUUID(),
        topicId,
        text: "Blocked",
      })
    ).status,
    403,
  );
  f.identity.user = f.users.admin;
  await f.call("/api/forums", {
    action: "moderate",
    topicId,
    operation: "unlock",
  });
  await f.call("/api/forums", {
    action: "moderate",
    topicId,
    replyId,
    operation: "hide",
  });
  let detail = await (
    await f.call(`/api/forums?view=topic&id=${topicId}`)
  ).json();
  assert.equal(detail.replies[0].text, "");
  await f.call("/api/forums", {
    action: "moderate",
    topicId,
    operation: "hide",
  });
  assert.equal(
    (await f.call(`/api/forums?view=topic&id=${topicId}`)).status,
    404,
  );
  await f.store.setJSON("topics/legacy.json", {
    id: "legacy",
    title: "Archive",
    text: "Old topic",
    authorName: "Old",
    createdAt: "2026-01-01T00:00:00Z",
  });
  assert.equal(
    (await (await f.call("/api/forums")).json()).topics[0].category,
    "general",
  );
});

test("legacy requests can be refused and are visible only to their owner and admins", async () => {
  const f = await registered();
  await f.store.setJSON("forum-requests/legacy.json", {
    id: "legacy",
    title: "Legacy request",
    text: "Opening",
    requesterId: "alice",
    requesterName: "Alice",
  });
  f.identity.user = f.users.admin;
  assert.equal(
    (
      await f.call("/api/forums", {
        action: "moderate_request",
        id: "legacy",
        decision: "reject",
      })
    ).status,
    200,
  );
  f.identity.user = f.users.alice;
  assert.equal(
    (await (await f.call("/api/forums?view=requests")).json()).requests[0]
      .state,
    "rejected",
  );
  assert.equal((await (await f.call("/api/forums")).json()).topics.length, 0);
});
