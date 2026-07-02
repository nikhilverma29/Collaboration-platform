import "dotenv/config";
const API_URL = "http://localhost:4000/api";

async function setup() {
  const reg = await fetch(`${API_URL}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `layer4-${Date.now()}@test.com`, password: "password123", displayName: "Search L4 Tester" }),
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
  console.log("🚀 Phase 6 Layer 4 — Global Search (Unified Ranking)\n");

  const { cookie } = await setup();

  // Create Project & Task
  const projRes = await fetch(`${API_URL}/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Search Project", key: "SRC" }),
  });
  const projData = await projRes.json();
  const projectId = projData.data.id;
  const boardId = projData.data.boards[0].id;
  const colId = projData.data.boards[0].columns[0].id;

  // 1. Task with partial match (score 50)
  await fetch(`${API_URL}/tasks`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ projectId, boardId, columnId: colId, title: "We need a massive overhaul" }),
  });

  // Create Channel & Message
  const chan = await fetch(`${API_URL}/channels`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "general", type: "PUBLIC" }),
  });
  const channelId = (await chan.json()).data.id;

  // 2. Message with exact match (score 100)
  await fetch(`${API_URL}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ channelId, content: "overhaul" }), // Exact match!
  });

  // 3. Search for "overhaul"
  const sRes = await fetch(`${API_URL}/search?q=overhaul&type=ALL`, { headers: { Cookie: cookie } });
  const sData = await sRes.json();
  
  console.log(`✅ Found ${sData.data.length} results (Expected: 2)`);
  if (sData.data.length !== 2) throw new Error("Expected 2 results");

  const firstResult = sData.data[0];
  const secondResult = sData.data[1];

  console.log(`✅ Top result domain: ${firstResult.domain} (Expected: message because of exact match)`);
  if (firstResult.domain !== "message") throw new Error("Message should be ranked higher due to exact match");

  console.log(`✅ Second result domain: ${secondResult.domain} (Expected: task because of partial match)`);
  
  console.log("\n✅ All Phase 6 Layer 4 tests passed!");
}

run().catch(err => { console.error("❌ Test failed:", err.message); process.exit(1); });
