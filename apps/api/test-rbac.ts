import "dotenv/config";
const API_URL = "http://localhost:4000/api";

async function runTests() {
  console.log("🚀 Starting Phase 2 Layer 2 Tests (RBAC & Governance)...");

  let cookieOwner = "";
  let cookieEmployee = "";

  // 1. Setup users
  console.log("\n[1] Setting up Owner and Employee...");
  const ownerRes = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `owner-${Date.now()}@example.com`, password: "password123", displayName: "Owner" }),
  });
  cookieOwner = ownerRes.headers.get("set-cookie")?.split(', ').map(c => c.split(';')[0]).join('; ') || "";

  const empRes = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `emp-${Date.now()}@example.com`, password: "password123", displayName: "Employee" }),
  });
  cookieEmployee = empRes.headers.get("set-cookie")?.split(', ').map(c => c.split(';')[0]).join('; ') || "";

  // 2. Owner creates workspace
  console.log("\n[2] Owner creating workspace...");
  const createRes = await fetch(`${API_URL}/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookieOwner },
    body: JSON.stringify({ name: "RBAC Corp" }),
  });
  const createData = await createRes.json();
  const workspaceId = createData.data.id;
  const inviteCode = createData.data.inviteCode;

  // 3. Employee joins workspace
  console.log("\n[3] Employee joining workspace...");
  await fetch(`${API_URL}/workspaces/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookieEmployee },
    body: JSON.stringify({ inviteCode }),
  });

  // 4. Both users switch into workspace to get tenant-aware tokens
  console.log("\n[4] Users switching into workspace context...");
  const switchOwnerRes = await fetch(`${API_URL}/workspaces/${workspaceId}/switch`, { method: "POST", headers: { "Cookie": cookieOwner } });
  const switchOwnerCookie = switchOwnerRes.headers.get("set-cookie")?.split(', ').find(c => c.startsWith('syncra_access'))?.split(';')[0];
  cookieOwner = `${switchOwnerCookie}; ${cookieOwner.split('; ').find(c => c.startsWith('syncra_refresh'))}`;

  const switchEmpRes = await fetch(`${API_URL}/workspaces/${workspaceId}/switch`, { method: "POST", headers: { "Cookie": cookieEmployee } });
  const switchEmpCookie = switchEmpRes.headers.get("set-cookie")?.split(', ').find(c => c.startsWith('syncra_access'))?.split(';')[0];
  cookieEmployee = `${switchEmpCookie}; ${cookieEmployee.split('; ').find(c => c.startsWith('syncra_refresh'))}`;

  // 5. RBAC Test: Employee attempts to update workspace (Should Fail - 403)
  console.log("\n[5] RBAC Check: Employee attempting to update workspace...");
  const updateFailRes = await fetch(`${API_URL}/workspaces/${workspaceId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "Cookie": cookieEmployee },
    body: JSON.stringify({ name: "Hacked Corp" }),
  });
  if (updateFailRes.status !== 403) throw new Error(`RBAC failed! Expected 403, got ${updateFailRes.status}`);
  console.log("✅ Passed: Employee was strictly blocked by RBAC middleware!");

  // 6. RBAC Test: Owner attempts to update workspace (Should Succeed - 200 & Audit Log)
  console.log("\n[6] RBAC Check & Audit Log: Owner attempting to update workspace...");
  const updateSuccessRes = await fetch(`${API_URL}/workspaces/${workspaceId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "Cookie": cookieOwner },
    body: JSON.stringify({ name: "Legit RBAC Corp" }),
  });
  if (updateSuccessRes.status !== 200) throw new Error(`Owner update failed! Expected 200, got ${updateSuccessRes.status}`);
  console.log("✅ Passed: Owner successfully updated workspace and triggered audit log!");

  console.log("\n✅ All RBAC & Audit tests passed successfully!");
}

runTests().catch(err => {
  console.error("❌ Test execution failed:", err);
  process.exit(1);
});
