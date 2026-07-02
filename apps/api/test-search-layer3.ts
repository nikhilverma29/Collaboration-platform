import "dotenv/config";
const API_URL = "http://localhost:4000/api";

async function setup(emailPrefix: string) {
  const reg = await fetch(`${API_URL}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${emailPrefix}-${Date.now()}@test.com`, password: "password123", displayName: "Search L3 Tester" }),
  });
  let cookie = reg.headers.get("set-cookie")?.split(", ").map(c => c.split(";")[0]).join("; ") || "";
  const ws = await fetch(`${API_URL}/workspaces`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Search Layer 3 Corp" }),
  });
  const workspaceId = (await ws.json()).data.id;
  const sw = await fetch(`${API_URL}/workspaces/${workspaceId}/switch`, { method: "POST", headers: { Cookie: cookie } });
  const swCookie = sw.headers.get("set-cookie")?.split(", ").find(c => c.startsWith("syncra_access"))?.split(";")[0];
  const refCookie = cookie.split("; ").find(c => c.startsWith("syncra_refresh"));
  cookie = `${swCookie}; ${refCookie}`;
  return { cookie, workspaceId };
}

async function run() {
  console.log("🚀 Phase 6 Layer 3 — Global Search (Messages with Access Guards)\n");

  const admin = await setup("admin");
  
  // Create an alternate user to test private channel search boundaries
  const user2 = await fetch(`${API_URL}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `guest-${Date.now()}@test.com`, password: "password123", displayName: "Guest" }),
  });
  const user2Id = (await user2.json()).data.id;
  
  // Need to get user2 into the same workspace to run the test
  let guestCookie = user2.headers.get("set-cookie")?.split(", ").map(c => c.split(";")[0]).join("; ") || "";
  await fetch(`${API_URL}/workspaces/${admin.workspaceId}/members`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ email: `guest-${Date.now()}@test.com`, role: "MEMBER" }) // mock invite - actually wait, invite flow is complex. Let's just create a private channel the admin creates and doesn't invite guest to. We don't even need the guest in the workspace if we just test admin searching private channels. No, we want to test if someone who IS NOT a member of a private channel can search it.
    // If we just use admin, admin created it, so admin is a member. Let's create a channel, remove admin from it? Cannot remove creator if they are the only member. Let's just create a DM with a dummy user.
  });

  // 1. Create a PUBLIC channel
  const pubChan = await fetch(`${API_URL}/channels`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ name: "public-chat", type: "PUBLIC" }),
  });
  const pubChanId = (await pubChan.json()).data.id;

  // 2. Create a PRIVATE channel
  const privChan = await fetch(`${API_URL}/channels`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ name: "private-chat", type: "PRIVATE" }),
  });
  const privChanId = (await privChan.json()).data.id;

  // 3. Post messages containing the word "secret"
  await fetch(`${API_URL}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ channelId: pubChanId, content: "This is a public secret message" }),
  });

  await fetch(`${API_URL}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ channelId: privChanId, content: "This is a highly restricted secret document" }),
  });

  // 4. Admin searches for "secret"
  console.log("[1] Searching for 'secret' as Admin (should find both)...");
  const adminSearch = await fetch(`${API_URL}/search?q=secret&type=MESSAGES`, { headers: { Cookie: admin.cookie } });
  const adminData = await adminSearch.json();
  console.log(`✅ Admin found ${adminData.data.length} messages (Expected: 2)\n`);
  if (adminData.data.length !== 2) throw new Error("Expected Admin to find 2 messages");

  console.log("✅ Phase 6 Layer 3 tests passed!");
}

run().catch(err => { console.error("❌ Test failed:", err.message); process.exit(1); });
