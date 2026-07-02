import "dotenv/config";
const API_URL = "http://localhost:4000/api";

async function run() {
  console.log("🚀 Phase 3 Layer 3 — Task API Tests\n");

  let cookie = "";
  let workspaceId = "";
  let projectId = "";
  let column1Id = "";
  let column2Id = "";
  let taskId = "";

  // 1. Setup Auth, Workspace, Project, and Columns
  console.log("[1] Setting up workspace and project...");
  const reg = await fetch(`${API_URL}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `t3-${Date.now()}@test.com`, password: "password123", displayName: "Task Tester" }),
  });
  cookie = reg.headers.get("set-cookie")?.split(", ").map(c => c.split(";")[0]).join("; ") || "";

  const ws = await fetch(`${API_URL}/workspaces`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Task Testing Corp" }),
  });
  workspaceId = (await ws.json()).data.id;
  const sw = await fetch(`${API_URL}/workspaces/${workspaceId}/switch`, { method: "POST", headers: { Cookie: cookie } });
  
  const swCookie = sw.headers.get("set-cookie")?.split(", ").find(c => c.startsWith("syncra_access"))?.split(";")[0];
  const refCookie = cookie.split("; ").find(c => c.startsWith("syncra_refresh"));
  cookie = `${swCookie}; ${refCookie}`;

  const proj = await fetch(`${API_URL}/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Testing Project" }),
  });
  const projData = await proj.json();
  projectId = projData.data.id;
  column1Id = projData.data.boards[0].columns[0].id; // To Do
  column2Id = projData.data.boards[0].columns[1].id; // In Progress
  console.log("✅ Setup complete\n");

  // 2. Create Task
  console.log("[2] Creating task...");
  const createRes = await fetch(`${API_URL}/tasks`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      projectId,
      columnId: column1Id,
      title: "Write integration tests",
      description: "Ensure layer 3 works perfectly",
      priority: "HIGH",
    }),
  });
  const createData = await createRes.json();
  if (!createData.success) throw new Error(`Create task failed: ${JSON.stringify(createData)}`);
  taskId = createData.data.id;
  console.log(`✅ Task created: "${createData.data.title}" (Priority: ${createData.data.priority})\n`);

  // 3. Update Task
  console.log("[3] Updating task...");
  const updateRes = await fetch(`${API_URL}/tasks/${taskId}`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      priority: "URGENT",
      status: "IN_PROGRESS"
    }),
  });
  const updateData = await updateRes.json();
  if (!updateData.success) throw new Error(`Update task failed: ${JSON.stringify(updateData)}`);
  console.log(`✅ Task updated: Priority -> ${updateData.data.priority}, Status -> ${updateData.data.status}\n`);

  // 4. Move Task (Drag & Drop Simulation)
  console.log("[4] Moving task to another column...");
  const moveRes = await fetch(`${API_URL}/tasks/${taskId}/move`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      columnId: column2Id,
      position: 1
    }),
  });
  const moveData = await moveRes.json();
  if (!moveData.success) throw new Error(`Move task failed: ${JSON.stringify(moveData)}`);
  console.log(`✅ Task moved to column: ${moveData.data.columnId} at position ${moveData.data.position}\n`);

  // 5. Get Task with History
  console.log("[5] Fetching task with history...");
  const getRes = await fetch(`${API_URL}/tasks/${taskId}`, { headers: { Cookie: cookie } });
  const getData = await getRes.json();
  if (!getData.success) throw new Error(`Get task failed: ${JSON.stringify(getData)}`);
  
  const history = getData.data.history;
  console.log(`✅ Task history retrieved (${history.length} events):`);
  history.forEach((h: any) => console.log(`   - ${h.action}`));
  console.log();

  // 6. Filter Tasks
  console.log("[6] Filtering tasks...");
  const filterRes = await fetch(`${API_URL}/tasks?projectId=${projectId}&priority=URGENT`, { headers: { Cookie: cookie } });
  const filterData = await filterRes.json();
  if (!filterData.success) throw new Error(`Filter tasks failed: ${JSON.stringify(filterData)}`);
  console.log(`✅ Found ${filterData.data.length} task(s) matching filter (Expected: 1)\n`);

  console.log("✅ All Phase 3 Layer 3 tests passed!");
}

run().catch(err => { console.error("❌ Test failed:", err.message); process.exit(1); });
