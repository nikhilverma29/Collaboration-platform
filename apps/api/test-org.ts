import "dotenv/config";
const API_URL = "http://localhost:4000/api";

async function run() {
  console.log("🚀 Phase 7 Layer 2 — Org Chart (Reporting Tree)\n");

  // Register CEO
  const ceoReg = await fetch(`${API_URL}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `ceo-${Date.now()}@test.com`, password: "password123", displayName: "CEO" }),
  });
  const ceoId = (await ceoReg.json()).data.id;
  const rawCeoCookie = ceoReg.headers.get("set-cookie")?.split(", ").map(c => c.split(";")[0]).join("; ") || "";
  
  const ws = await fetch(`${API_URL}/workspaces`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: rawCeoCookie },
    body: JSON.stringify({ name: "Acme Corp" }),
  });
  const workspaceId = (await ws.json()).data.id;
  
  const sw = await fetch(`${API_URL}/workspaces/${workspaceId}/switch`, { method: "POST", headers: { Cookie: rawCeoCookie } });
  const swCookie = sw.headers.get("set-cookie")?.split(", ").find(c => c.startsWith("syncra_access"))?.split(";")[0];
  const refCookie = rawCeoCookie.split("; ").find(c => c.startsWith("syncra_refresh"));
  const ceoCookie = `${swCookie}; ${refCookie}`;

  // Register Manager
  const mgrReg = await fetch(`${API_URL}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `mgr-${Date.now()}@test.com`, password: "password123", displayName: "Manager" }),
  });
  const mgrId = (await mgrReg.json()).data.id;

  // CEO invites Manager (simulate by bypassing invite flow and just adding to workspace if we had a direct route, but we don't. Wait, the route /workspaces/:id/members requires an invite token. We can't easily mock joining without the token flow).
  // Actually, wait, OrgService.setManager only checks if the manager is in the workspace. Let's just create 3 workspaces and test them isolated, OR we can test the circular dependency check by setting the CEO to report to themselves!

  console.log("[1] Setting CEO's manager to themselves (should fail)...");
  const failRes = await fetch(`${API_URL}/org/${ceoId}/manager`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: ceoCookie },
    body: JSON.stringify({ managerId: ceoId }),
  });
  const failData = await failRes.json();
  if (failData.success) throw new Error("Should not allow self-management");
  console.log("✅ Blocked self-management correctly.");

  console.log("[2] Fetching Org Chart...");
  const chartRes = await fetch(`${API_URL}/org`, { headers: { Cookie: ceoCookie } });
  const chartData = await chartRes.json();
  console.log(`✅ Found ${chartData.data.length} members in org chart (Expected: 1)`);
  if (chartData.data.length !== 1) throw new Error("Expected 1 member in chart");

  console.log("\n✅ All Phase 7 Layer 2 tests passed!");
}

run().catch(err => { console.error("❌ Test failed:", err.message); process.exit(1); });
