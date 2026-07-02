import "dotenv/config";
const API_URL = "http://localhost:4000/api";

async function setup() {
  const reg = await fetch(`${API_URL}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `lay4-${Date.now()}@test.com`, password: "password123", displayName: "Layer 4 Tester" }),
  });
  let cookie = reg.headers.get("set-cookie")?.split(", ").map(c => c.split(";")[0]).join("; ") || "";
  const ws = await fetch(`${API_URL}/workspaces`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Layer 4 Corp" }),
  });
  const workspaceId = (await ws.json()).data.id;
  const sw = await fetch(`${API_URL}/workspaces/${workspaceId}/switch`, { method: "POST", headers: { Cookie: cookie } });
  const swCookie = sw.headers.get("set-cookie")?.split(", ").find(c => c.startsWith("syncra_access"))?.split(";")[0];
  const refCookie = cookie.split("; ").find(c => c.startsWith("syncra_refresh"));
  cookie = `${swCookie}; ${refCookie}`;
  return { cookie, workspaceId };
}

async function run() {
  console.log("🚀 Phase 5 Layer 4 — Threads & Reactions Tests\n");

  const { cookie } = await setup();
  
  // Create channel
  const chan = await fetch(`${API_URL}/channels`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "thread-test", type: "PUBLIC" }),
  });
  const channelId = (await chan.json()).data.id;

  // Send parent message
  const m1 = await fetch(`${API_URL}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ channelId, content: "Parent message here" }),
  });
  const messageId = (await m1.json()).data.id;

  // 1. Thread Replies
  console.log("[1] Testing thread replies...");
  await fetch(`${API_URL}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ channelId, content: "Reply 1", parentId: messageId }),
  });
  await fetch(`${API_URL}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ channelId, content: "Reply 2", parentId: messageId }),
  });

  const repliesRes = await fetch(`${API_URL}/messages/${messageId}/replies`, { headers: { Cookie: cookie } });
  const repliesData = await repliesRes.json();
  if (!repliesData.success) throw new Error(`List replies failed`);
  console.log(`✅ Fetched ${repliesData.data.length} replies (Expected: 2)\n`);
  if (repliesData.data.length !== 2) throw new Error("Expected 2 replies");

  // 2. Reactions (Toggle)
  console.log("[2] Testing reactions (toggle logic)...");
  
  // Add 👍
  let reactRes = await fetch(`${API_URL}/messages/${messageId}/reactions`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ emoji: "👍" }),
  });
  let reactData = await reactRes.json();
  console.log(`✅ Reaction 1: ${reactData.data.action} ${reactData.data.emoji}`);

  // Add ❤️
  reactRes = await fetch(`${API_URL}/messages/${messageId}/reactions`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ emoji: "❤️" }),
  });
  reactData = await reactRes.json();
  console.log(`✅ Reaction 2: ${reactData.data.action} ${reactData.data.emoji}`);

  // Remove 👍 (Toggle)
  reactRes = await fetch(`${API_URL}/messages/${messageId}/reactions`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ emoji: "👍" }),
  });
  reactData = await reactRes.json();
  console.log(`✅ Reaction 3 (Toggle): ${reactData.data.action} ${reactData.data.emoji}\n`);

  // Verify only ❤️ remains
  const msgsRes = await fetch(`${API_URL}/messages?channelId=${channelId}`, { headers: { Cookie: cookie } });
  const msgsData = await msgsRes.json();
  const parentMsg = msgsData.data[0];
  console.log(`✅ Final reactions count on message: ${parentMsg.reactions.length} (Expected: 1)`);
  if (parentMsg.reactions.length !== 1 || parentMsg.reactions[0].emoji !== "❤️") {
    throw new Error("Reaction state is incorrect");
  }

  // 3. Typing Indicator
  console.log("\n[3] Testing typing indicator endpoint...");
  const typeRes = await fetch(`${API_URL}/messages/typing`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ channelId }),
  });
  const typeData = await typeRes.json();
  if (!typeData.success) throw new Error("Typing failed");
  console.log(`✅ Typing indicator endpoint responded successfully\n`);

  console.log("✅ All Phase 5 Layer 4 tests passed!");
}

run().catch(err => { console.error("❌ Test failed:", err.message); process.exit(1); });
