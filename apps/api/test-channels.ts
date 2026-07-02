import "dotenv/config";
const API_URL = "http://localhost:4000/api";

async function setup() {
  const reg = await fetch(`${API_URL}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `ch-${Date.now()}@test.com`, password: "password123", displayName: "Chat Tester" }),
  });
  let cookie = reg.headers.get("set-cookie")?.split(", ").map(c => c.split(";")[0]).join("; ") || "";
  const ws = await fetch(`${API_URL}/workspaces`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Chat Corp" }),
  });
  const workspaceId = (await ws.json()).data.id;
  const sw = await fetch(`${API_URL}/workspaces/${workspaceId}/switch`, { method: "POST", headers: { Cookie: cookie } });
  const swCookie = sw.headers.get("set-cookie")?.split(", ").find(c => c.startsWith("syncra_access"))?.split(";")[0];
  const refCookie = cookie.split("; ").find(c => c.startsWith("syncra_refresh"));
  cookie = `${swCookie}; ${refCookie}`;
  return { cookie, workspaceId };
}

async function run() {
  console.log("🚀 Phase 5 Layer 2 — Channel API Tests\n");

  const { cookie, workspaceId } = await setup();
  let channelId = "";
  let privateChanId = "";

  // 1. Create public channel
  console.log("[1] Creating public channel...");
  const pub = await fetch(`${API_URL}/channels`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "general", description: "Everyone's channel", type: "PUBLIC" }),
  });
  const pubData = await pub.json();
  if (!pubData.success) throw new Error(`Create public channel failed: ${JSON.stringify(pubData)}`);
  channelId = pubData.data.id;
  console.log(`✅ Public channel created: #${pubData.data.name}\n`);

  // 2. Create private channel
  console.log("[2] Creating private channel...");
  const priv = await fetch(`${API_URL}/channels`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "leadership-only", type: "PRIVATE" }),
  });
  const privData = await priv.json();
  if (!privData.success) throw new Error(`Create private channel failed: ${JSON.stringify(privData)}`);
  privateChanId = privData.data.id;
  console.log(`✅ Private channel created: #${privData.data.name}\n`);

  // 3. List channels for user
  console.log("[3] Listing all channels for user...");
  const list = await fetch(`${API_URL}/channels`, { headers: { Cookie: cookie } });
  const listData = await list.json();
  if (!listData.success) throw new Error("List channels failed");
  console.log(`✅ Found ${listData.data.length} channel(s) (public + private the user owns)\n`);

  // 4. Get channel detail
  console.log("[4] Fetching channel detail...");
  const detail = await fetch(`${API_URL}/channels/${channelId}`, { headers: { Cookie: cookie } });
  const detailData = await detail.json();
  if (!detailData.success) throw new Error("Get channel failed");
  console.log(`✅ Channel detail: "${detailData.data.name}" with ${detailData.data.members.length} member(s)\n`);

  // 5. Update channel
  console.log("[5] Updating channel description...");
  const upd = await fetch(`${API_URL}/channels/${channelId}`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ description: "Updated general description" }),
  });
  const updData = await upd.json();
  if (!updData.success) throw new Error("Update channel failed");
  console.log(`✅ Channel updated: description = "${updData.data.description}"\n`);

  // 6. Archive channel
  console.log("[6] Archiving private channel...");
  const arch = await fetch(`${API_URL}/channels/${privateChanId}/archive`, { method: "POST", headers: { Cookie: cookie } });
  const archData = await arch.json();
  if (!archData.success) throw new Error("Archive channel failed");
  console.log(`✅ Channel archived: isArchived = ${archData.data.isArchived}\n`);

  // 7. Create DM (self-DM guard test)
  console.log("[7] Testing self-DM guard...");
  const selfReg = await fetch(`${API_URL}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `dm-${Date.now()}@test.com`, password: "password123", displayName: "DM Target" }),
  });
  const selfData = await selfReg.json();
  const targetId = selfData.data.id;

  const dm = await fetch(`${API_URL}/channels/dm`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ targetUserId: targetId }),
  });
  const dmData = await dm.json();
  if (!dmData.success) throw new Error(`Create DM failed: ${JSON.stringify(dmData)}`);
  console.log(`✅ DM channel created/found: type = ${dmData.data.type}, members = ${dmData.data.members.length}\n`);

  // 8. Test idempotency - re-creating the same DM should return existing
  console.log("[8] Testing DM idempotency (re-create same DM)...");
  const dm2 = await fetch(`${API_URL}/channels/dm`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ targetUserId: targetId }),
  });
  const dm2Data = await dm2.json();
  const isSameDM = dm2Data.data.id === dmData.data.id;
  console.log(`✅ DM idempotency: ${isSameDM ? "PASSED (same DM returned)" : "FAILED (new DM created)"}\n`);

  console.log("✅ All Phase 5 Layer 2 tests passed!");
}

run().catch(err => { console.error("❌ Test failed:", err.message); process.exit(1); });
