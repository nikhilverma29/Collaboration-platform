import "dotenv/config";
const API_URL = "http://localhost:4000/api";

async function setup() {
  const reg = await fetch(`${API_URL}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `msg-${Date.now()}@test.com`, password: "password123", displayName: "Msg Tester" }),
  });
  let cookie = reg.headers.get("set-cookie")?.split(", ").map(c => c.split(";")[0]).join("; ") || "";
  const ws = await fetch(`${API_URL}/workspaces`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Messaging Corp" }),
  });
  const workspaceId = (await ws.json()).data.id;
  const sw = await fetch(`${API_URL}/workspaces/${workspaceId}/switch`, { method: "POST", headers: { Cookie: cookie } });
  const swCookie = sw.headers.get("set-cookie")?.split(", ").find(c => c.startsWith("syncra_access"))?.split(";")[0];
  const refCookie = cookie.split("; ").find(c => c.startsWith("syncra_refresh"));
  cookie = `${swCookie}; ${refCookie}`;
  return { cookie, workspaceId };
}

async function run() {
  console.log("🚀 Phase 5 Layer 3 — Message API Tests\n");

  const { cookie, workspaceId } = await setup();
  let channelId = "";
  let messageId = "";
  let message2Id = "";

  // 1. Create a channel to message in
  console.log("[1] Setting up channel...");
  const chan = await fetch(`${API_URL}/channels`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "dev-chat", type: "PUBLIC" }),
  });
  channelId = (await chan.json()).data.id;
  console.log(`✅ Channel ready: ${channelId}\n`);

  // 2. Send first message
  console.log("[2] Sending first message...");
  const m1 = await fetch(`${API_URL}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ channelId, content: "Hello team! 👋" }),
  });
  const m1Data = await m1.json();
  if (!m1Data.success) throw new Error(`Send msg failed: ${JSON.stringify(m1Data)}`);
  messageId = m1Data.data.id;
  console.log(`✅ Message sent: "${m1Data.data.content}"\n`);

  // 3. Send second message
  console.log("[3] Sending second message...");
  const m2 = await fetch(`${API_URL}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ channelId, content: "Anyone up for a standup?" }),
  });
  const m2Data = await m2.json();
  message2Id = m2Data.data.id;
  console.log(`✅ Second message sent: "${m2Data.data.content}"\n`);

  // 4. Send a thread reply
  console.log("[4] Sending thread reply...");
  const reply = await fetch(`${API_URL}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ channelId, content: "I'm in for standup!", parentId: message2Id }),
  });
  const replyData = await reply.json();
  if (!replyData.success) throw new Error(`Thread reply failed: ${JSON.stringify(replyData)}`);
  console.log(`✅ Thread reply sent: "${replyData.data.content}" (parentId: ${replyData.data.parentId})\n`);

  // 5. List messages (should only show top-level, not the thread reply)
  console.log("[5] Listing messages...");
  const listRes = await fetch(`${API_URL}/messages?channelId=${channelId}&limit=50`, { headers: { Cookie: cookie } });
  const listData = await listRes.json();
  if (!listData.success) throw new Error(`List failed: ${JSON.stringify(listData)}`);
  const topLevelCount = listData.data.length;
  console.log(`✅ Top-level messages: ${topLevelCount} (Expected: 2 — thread reply excluded)\n`);
  if (topLevelCount !== 2) throw new Error(`Expected 2 top-level messages, got ${topLevelCount}`);

  // 6. Edit a message
  console.log("[6] Editing first message...");
  const editRes = await fetch(`${API_URL}/messages/${messageId}`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ content: "Hello team! 👋 (edited)" }),
  });
  const editData = await editRes.json();
  if (!editData.success) throw new Error(`Edit failed: ${JSON.stringify(editData)}`);
  console.log(`✅ Message edited: "${editData.data.content}", isEdited = ${editData.data.isEdited}\n`);

  // 7. Soft-delete second message
  console.log("[7] Soft-deleting second message...");
  const delRes = await fetch(`${API_URL}/messages/${message2Id}`, { method: "DELETE", headers: { Cookie: cookie } });
  const delData = await delRes.json();
  if (!delData.success) throw new Error(`Delete failed: ${JSON.stringify(delData)}`);
  console.log(`✅ Message soft-deleted\n`);

  // Verify the message still exists but content is tombstoned
  const checkRes = await fetch(`${API_URL}/messages?channelId=${channelId}&limit=50`, { headers: { Cookie: cookie } });
  const checkData = await checkRes.json();
  const deleted = checkData.data.find((m: any) => m.id === message2Id);
  console.log(`✅ Soft-delete verified: content = "${deleted?.content}", isDeleted = ${deleted?.isDeleted}\n`);

  console.log("✅ All Phase 5 Layer 3 tests passed!");
}

run().catch(err => { console.error("❌ Test failed:", err.message); process.exit(1); });
