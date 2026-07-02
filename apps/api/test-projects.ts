import "dotenv/config";
const API_URL = "http://localhost:4000/api";

async function run() {
  console.log("🚀 Phase 3 Layer 2 — Project & Column API Tests\n");

  let cookie = "";
  let workspaceId = "";
  let projectId = "";
  let boardId = "";
  let columnId = "";

  // 1. Auth + Workspace setup
  console.log("[1] Register + create workspace + switch...");
  const reg = await fetch(`${API_URL}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `p3-${Date.now()}@test.com`, password: "password123", displayName: "Project Owner" }),
  });
  cookie = reg.headers.get("set-cookie")?.split(", ").map(c => c.split(";")[0]).join("; ") || "";

  const ws = await fetch(`${API_URL}/workspaces`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Phase 3 Corp" }),
  });
  const wsData = await ws.json();
  workspaceId = wsData.data.id;

  const sw = await fetch(`${API_URL}/workspaces/${workspaceId}/switch`, { method: "POST", headers: { Cookie: cookie } });
  const swCookie = sw.headers.get("set-cookie")?.split(", ").find(c => c.startsWith("syncra_access"))?.split(";")[0];
  const refCookie = cookie.split("; ").find(c => c.startsWith("syncra_refresh"));
  cookie = `${swCookie}; ${refCookie}`;
  console.log("✅ Setup complete\n");

  // 2. Create project
  console.log("[2] Creating project...");
  const createRes = await fetch(`${API_URL}/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Launch Campaign", description: "Q3 launch tasks" }),
  });
  const createData = await createRes.json();
  if (!createData.success) throw new Error(`Create failed: ${JSON.stringify(createData)}`);
  projectId = createData.data.id;
  boardId = createData.data.boards[0].id;
  console.log(`✅ Project created: ${createData.data.name} (id: ${projectId})`);
  console.log(`   Default board: ${createData.data.boards[0].name}`);
  console.log(`   Columns: ${createData.data.boards[0].columns.map((c: any) => c.name).join(" → ")}\n`);

  // 3. List projects
  console.log("[3] Listing workspace projects...");
  const listRes = await fetch(`${API_URL}/projects`, { headers: { Cookie: cookie } });
  const listData = await listRes.json();
  if (!listData.success) throw new Error(`List failed: ${JSON.stringify(listData)}`);
  console.log(`✅ Found ${listData.data.length} project(s)\n`);

  // 4. Get single project
  console.log("[4] Fetching single project detail...");
  const getRes = await fetch(`${API_URL}/projects/${projectId}`, { headers: { Cookie: cookie } });
  const getData = await getRes.json();
  if (!getData.success) throw new Error(`Get failed: ${JSON.stringify(getData)}`);
  console.log(`✅ Project detail fetched: ${getData.data.name}\n`);

  // 5. Update project
  console.log("[5] Updating project name...");
  const updateRes = await fetch(`${API_URL}/projects/${projectId}`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Launch Campaign v2" }),
  });
  const updateData = await updateRes.json();
  if (!updateData.success) throw new Error(`Update failed: ${JSON.stringify(updateData)}`);
  console.log(`✅ Project updated to: ${updateData.data.name}\n`);

  // 6. List columns
  console.log("[6] Listing board columns...");
  const colListRes = await fetch(`${API_URL}/projects/boards/${boardId}/columns`, { headers: { Cookie: cookie } });
  const colListData = await colListRes.json();
  if (!colListData.success) throw new Error(`List columns failed: ${JSON.stringify(colListData)}`);
  console.log(`✅ Found ${colListData.data.length} columns: ${colListData.data.map((c: any) => c.name).join(", ")}\n`);

  // 7. Create a new column
  console.log("[7] Creating a new column...");
  const colCreateRes = await fetch(`${API_URL}/projects/boards/${boardId}/columns`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Blocked" }),
  });
  const colCreateData = await colCreateRes.json();
  if (!colCreateData.success) throw new Error(`Create column failed: ${JSON.stringify(colCreateData)}`);
  columnId = colCreateData.data.id;
  console.log(`✅ New column created: "${colCreateData.data.name}" at position ${colCreateData.data.position}\n`);

  // 8. Update column
  console.log("[8] Renaming column...");
  const colUpdateRes = await fetch(`${API_URL}/projects/columns/${columnId}`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Blocked / On Hold" }),
  });
  const colUpdateData = await colUpdateRes.json();
  if (!colUpdateData.success) throw new Error(`Update column failed: ${JSON.stringify(colUpdateData)}`);
  console.log(`✅ Column renamed to: "${colUpdateData.data.name}"\n`);

  // 9. Archive project
  console.log("[9] Archiving project...");
  const archiveRes = await fetch(`${API_URL}/projects/${projectId}/archive`, { method: "POST", headers: { Cookie: cookie } });
  const archiveData = await archiveRes.json();
  if (!archiveData.success) throw new Error(`Archive failed: ${JSON.stringify(archiveData)}`);
  console.log(`✅ Project archived: isArchived = ${archiveData.data.isArchived}\n`);

  console.log("✅ All Phase 3 Layer 2 tests passed!");
}

run().catch(err => { console.error("❌ Test failed:", err.message); process.exit(1); });
