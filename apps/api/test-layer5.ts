import "dotenv/config";
const API_URL = "http://localhost:4000/api";

async function setup() {
  const reg = await fetch(`${API_URL}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `lay5-${Date.now()}@test.com`, password: "password123", displayName: "Layer 5 Tester" }),
  });
  let cookie = reg.headers.get("set-cookie")?.split(", ").map(c => c.split(";")[0]).join("; ") || "";
  const ws = await fetch(`${API_URL}/workspaces`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Layer 5 Corp" }),
  });
  const workspaceId = (await ws.json()).data.id;
  const sw = await fetch(`${API_URL}/workspaces/${workspaceId}/switch`, { method: "POST", headers: { Cookie: cookie } });
  const swCookie = sw.headers.get("set-cookie")?.split(", ").find(c => c.startsWith("syncra_access"))?.split(";")[0];
  const refCookie = cookie.split("; ").find(c => c.startsWith("syncra_refresh"));
  cookie = `${swCookie}; ${refCookie}`;
  return { cookie, workspaceId };
}

async function run() {
  console.log("🚀 Phase 5 Layer 5 — Read Receipts & Badges Tests\n");

  const { cookie } = await setup();
  
  // 1. Create channel
  const chan = await fetch(`${API_URL}/channels`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "receipt-test", type: "PUBLIC" }),
  });
  const channelId = (await chan.json()).data.id;

  // 2. Send 3 messages
  console.log("[1] Sending 3 messages...");
  const m1 = await fetch(`${API_URL}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ channelId, content: "Msg 1" }) });
  const msg1Id = (await m1.json()).data.id;

  await new Promise(r => setTimeout(r, 50));
  const m2 = await fetch(`${API_URL}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ channelId, content: "Msg 2" }) });
  const msg2Id = (await m2.json()).data.id;

  await new Promise(r => setTimeout(r, 50));
  const m3 = await fetch(`${API_URL}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ channelId, content: "Msg 3" }) });
  const msg3Id = (await m3.json()).data.id;
  console.log(`✅ Messages sent (IDs: ${msg1Id}, ${msg2Id}, ${msg3Id})\n`);

  // 3. Check initial unread count (should be 3 since no receipts exist yet)
  console.log("[2] Checking unread count before reading...");
  const uc1Res = await fetch(`${API_URL}/channels/${channelId}/unread-count`, { headers: { Cookie: cookie } });
  const uc1Data = await uc1Res.json();
  console.log(`✅ Unread count: ${uc1Data.data.unreadCount} (Expected: 3)\n`);
  if (uc1Data.data.unreadCount !== 3) throw new Error("Expected initial unread count to be 3");

  // 4. Mark Message 1 as read (leaves 2 and 3 unread)
  console.log("[3] Marking Msg 1 as read...");
  await fetch(`${API_URL}/channels/${channelId}/read`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ messageId: msg1Id }),
  });

  const uc2Res = await fetch(`${API_URL}/channels/${channelId}/unread-count`, { headers: { Cookie: cookie } });
  const uc2Data = await uc2Res.json();
  console.log(`✅ Unread count: ${uc2Data.data.unreadCount} (Expected: 2)\n`);
  if (uc2Data.data.unreadCount !== 2) throw new Error("Expected unread count to be 2");

  // 5. Mark Message 3 (latest) as read (leaves 0 unread)
  console.log("[4] Marking Msg 3 as read...");
  await fetch(`${API_URL}/channels/${channelId}/read`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ messageId: msg3Id }),
  });

  const uc3Res = await fetch(`${API_URL}/channels/${channelId}/unread-count`, { headers: { Cookie: cookie } });
  const uc3Data = await uc3Res.json();
  console.log(`✅ Unread count: ${uc3Data.data.unreadCount} (Expected: 0)\n`);
  if (uc3Data.data.unreadCount !== 0) throw new Error("Expected unread count to be 0");

  console.log("✅ All Phase 5 Layer 5 tests passed!");
}

run().catch(err => { console.error("❌ Test failed:", err.message); process.exit(1); });
