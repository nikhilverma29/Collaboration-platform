import "dotenv/config";
const API_URL = "http://localhost:4000/api";

async function runTests() {
  console.log("🚀 Starting Middleware Tests (Layer 5)...");

  // 1. Test unauthenticated request (auth.ts)
  console.log("\n[1] Testing unauthenticated request (expecting 401)...");
  const unauthedRes = await fetch(`${API_URL}/workspaces`, { method: "GET" });
  if (unauthedRes.status !== 401) throw new Error(`Expected 401, got ${unauthedRes.status}`);
  console.log("✅ Passed: Unauthenticated request rejected by auth.ts");

  // 2. Register/Login to get an authenticated session without tenant context
  console.log("\n[2] Registering user...");
  const regRes = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `mid-${Date.now()}@example.com`,
      password: "password123",
      displayName: "Middleware Tester",
    }),
  });
  const authData = await regRes.json();
  let cookieHeader = regRes.headers.get("set-cookie")?.split(', ').map(c => c.split(';')[0]).join('; ') || "";

  // 3. Test tenant middleware without a selected workspace (tenant.ts)
  console.log("\n[3] Testing tenant endpoint WITHOUT switching workspace (expecting 403)...");
  const noTenantRes = await fetch(`${API_URL}/workspaces/current`, {
    method: "GET",
    headers: { "Cookie": cookieHeader }
  });
  if (noTenantRes.status !== 403) throw new Error(`Expected 403, got ${noTenantRes.status}`);
  console.log("✅ Passed: Request without tenant context rejected by tenant.ts");

  // 4. Create a workspace
  console.log("\n[4] Creating a workspace...");
  const createRes = await fetch(`${API_URL}/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookieHeader },
    body: JSON.stringify({ name: "Middleware Corp" }),
  });
  const createData = await createRes.json();
  const workspaceId = createData.data.id;
  console.log(`Created workspace: ${workspaceId}`);

  // 5. Switch into the workspace
  console.log("\n[5] Switching into the workspace...");
  const switchRes = await fetch(`${API_URL}/workspaces/${workspaceId}/switch`, {
    method: "POST",
    headers: { "Cookie": cookieHeader }
  });
  const switchData = await switchRes.json();
  if (!switchData.success) throw new Error("Switch failed");
  console.log("Switched to workspace. Role:", switchData.data.role);

  // Extract the newly issued tenant-aware access token
  const newCookies = switchRes.headers.get("set-cookie");
  if (newCookies) {
    const accessCookie = newCookies.split(', ').find(c => c.startsWith('syncra_access'));
    if (accessCookie) {
      // Keep refresh token from before, replace access token
      cookieHeader = `${accessCookie.split(';')[0]}; ${cookieHeader.split('; ').find(c => c.startsWith('syncra_refresh'))}`;
    }
  }

  // 6. Test tenant middleware WITH a selected workspace (tenant.ts)
  console.log("\n[6] Testing tenant endpoint WITH switched workspace (expecting 200)...");
  const tenantRes = await fetch(`${API_URL}/workspaces/current`, {
    method: "GET",
    headers: { "Cookie": cookieHeader }
  });
  const tenantData = await tenantRes.json();

  if (!tenantData.success) throw new Error("Tenant endpoint failed");
  console.log("✅ Passed: Successfully accessed tenant endpoint:");
  console.log(JSON.stringify(tenantData.data, null, 2));

  console.log("\n✅ All Middleware tests passed successfully!");
}

runTests().catch(err => {
  console.error("❌ Test execution failed:", err);
  process.exit(1);
});
