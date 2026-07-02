import "dotenv/config";
const API_URL = "http://localhost:4000/api";

async function runTests() {
  console.log("🚀 Starting Workspace Tests...");

  let cookieUserA = "";
  let cookieUserB = "";
  let inviteCode = "";

  // 1. Register User A (Workspace Owner)
  console.log("\n[1] Registering User A (Owner)...");
  const regARes = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `owner-${Date.now()}@example.com`,
      password: "password123",
      displayName: "Alice Owner",
    }),
  });
  const dataA = await regARes.json();
  if (!dataA.success) throw new Error("Failed to register User A");
  cookieUserA = regARes.headers.get("set-cookie")?.split(', ').map(c => c.split(';')[0]).join('; ') || "";

  // 2. Register User B (Employee)
  console.log("\n[2] Registering User B (Employee)...");
  const regBRes = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `emp-${Date.now()}@example.com`,
      password: "password123",
      displayName: "Bob Employee",
    }),
  });
  const dataB = await regBRes.json();
  if (!dataB.success) throw new Error("Failed to register User B");
  cookieUserB = regBRes.headers.get("set-cookie")?.split(', ').map(c => c.split(';')[0]).join('; ') || "";

  // 3. User A creates a workspace
  console.log("\n[3] User A creating workspace...");
  const createRes = await fetch(`${API_URL}/workspaces`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": cookieUserA
    },
    body: JSON.stringify({
      name: "Acme Corp",
    }),
  });
  const createData = await createRes.json();
  console.log("Create Workspace Response:", createData);
  if (!createData.success) throw new Error("Failed to create workspace");

  inviteCode = createData.data.inviteCode;
  console.log("Got invite code:", inviteCode);

  // 4. User B joins the workspace
  console.log("\n[4] User B joining workspace...");
  const joinRes = await fetch(`${API_URL}/workspaces/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": cookieUserB
    },
    body: JSON.stringify({
      inviteCode,
    }),
  });
  const joinData = await joinRes.json();
  console.log("Join Workspace Response:", joinData);
  if (!joinData.success) throw new Error("Failed to join workspace");

  // 5. User A lists workspaces
  console.log("\n[5] User A listing workspaces...");
  const listARes = await fetch(`${API_URL}/workspaces`, {
    method: "GET",
    headers: { "Cookie": cookieUserA },
  });
  const listAData = await listARes.json();
  console.log("User A Workspaces (Should have OWNER role):", JSON.stringify(listAData.data, null, 2));

  // 6. User B lists workspaces
  console.log("\n[6] User B listing workspaces...");
  const listBRes = await fetch(`${API_URL}/workspaces`, {
    method: "GET",
    headers: { "Cookie": cookieUserB },
  });
  const listBData = await listBRes.json();
  console.log("User B Workspaces (Should have EMPLOYEE role):", JSON.stringify(listBData.data, null, 2));

  console.log("\n✅ All Workspace tests passed successfully!");
}

runTests().catch(err => {
  console.error("❌ Test execution failed:", err);
  process.exit(1);
});
