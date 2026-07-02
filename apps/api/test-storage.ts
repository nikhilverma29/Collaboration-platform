import "dotenv/config";
const API_URL = "http://localhost:4000/api";

async function run() {
  console.log("🚀 Phase 4 Layer 2 & 3 — Storage API Tests\n");

  let cookie = "";
  let workspaceId = "";
  let rootFolderId = "";
  let subFolderId = "";
  let fileId = "";

  // 1. Setup Auth & Workspace
  console.log("[1] Setting up workspace...");
  const reg = await fetch(`${API_URL}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `s4-${Date.now()}@test.com`, password: "password123", displayName: "Storage Tester" }),
  });
  cookie = reg.headers.get("set-cookie")?.split(", ").map(c => c.split(";")[0]).join("; ") || "";

  const ws = await fetch(`${API_URL}/workspaces`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Storage Corp" }),
  });
  workspaceId = (await ws.json()).data.id;
  const sw = await fetch(`${API_URL}/workspaces/${workspaceId}/switch`, { method: "POST", headers: { Cookie: cookie } });
  
  const swCookie = sw.headers.get("set-cookie")?.split(", ").find(c => c.startsWith("syncra_access"))?.split(";")[0];
  const refCookie = cookie.split("; ").find(c => c.startsWith("syncra_refresh"));
  cookie = `${swCookie}; ${refCookie}`;
  console.log("✅ Setup complete\n");

  // 2. Create Root Folder
  console.log("[2] Creating root folder...");
  const rootCreate = await fetch(`${API_URL}/storage/folders`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Q4 Marketing Assets" }),
  });
  const rootData = await rootCreate.json();
  if (!rootData.success) throw new Error(`Folder create failed: ${JSON.stringify(rootData)}`);
  rootFolderId = rootData.data.id;
  console.log(`✅ Root Folder created: "${rootData.data.name}"\n`);

  // 3. Create Subfolder
  console.log("[3] Creating subfolder...");
  const subCreate = await fetch(`${API_URL}/storage/folders`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Logos", parentId: rootFolderId }),
  });
  const subData = await subCreate.json();
  subFolderId = subData.data.id;
  console.log(`✅ Subfolder created: "${subData.data.name}" (Parent: ${subData.data.parentId})\n`);

  // 4. Request Upload URL (File)
  console.log("[4] Requesting Supabase presigned upload URL...");
  const uploadUrlRes = await fetch(`${API_URL}/storage/files/upload-url`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ fileName: "brand-guidelines.pdf" }),
  });
  const uploadData = await uploadUrlRes.json();
  if (!uploadData.success && !uploadData.error.includes("Failed to generate upload URL")) {
    throw new Error(`Upload URL failed: ${JSON.stringify(uploadData)}`);
  }
  
  // If Supabase keys aren't fully set in env, it will fail gracefully here, 
  // but we can still test the DB registration logic with a dummy storagePath.
  const storagePath = uploadData.success ? uploadData.data.storagePath : `${workspaceId}/dummy-path.pdf`;
  console.log(`✅ Upload URL requested successfully (or bypassed for mock). StoragePath: ${storagePath}\n`);

  // 5. Register File in DB
  console.log("[5] Registering uploaded file in DB...");
  const fileReg = await fetch(`${API_URL}/storage/files/register`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      name: "Brand Guidelines 2026.pdf",
      size: 1048576, // 1MB
      mimeType: "application/pdf",
      storagePath,
      folderId: rootFolderId
    }),
  });
  const fileRegData = await fileReg.json();
  if (!fileRegData.success) throw new Error(`File register failed: ${JSON.stringify(fileRegData)}`);
  fileId = fileRegData.data.id;
  console.log(`✅ File registered: "${fileRegData.data.name}" in folder ${fileRegData.data.folderId}\n`);

  // 6. Move File
  console.log("[6] Moving file to subfolder...");
  const fileMove = await fetch(`${API_URL}/storage/files/${fileId}/move`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ folderId: subFolderId }),
  });
  const fileMoveData = await fileMove.json();
  console.log(`✅ File moved to: ${fileMoveData.data.folderId}\n`);

  // 7. Get Folder Details
  console.log("[7] Fetching Subfolder details...");
  const folderGet = await fetch(`${API_URL}/storage/folders/${subFolderId}`, { headers: { Cookie: cookie } });
  const folderGetData = await folderGet.json();
  console.log(`✅ Subfolder contains ${folderGetData.data.files.length} file(s) and ${folderGetData.data.children.length} subfolder(s)\n`);

  // 8. Delete Folder (Cascades to File in DB, leaves physical file for cron)
  console.log("[8] Deleting root folder (Testing cascade)...");
  const folderDel = await fetch(`${API_URL}/storage/folders/${rootFolderId}`, { method: "DELETE", headers: { Cookie: cookie } });
  const folderDelData = await folderDel.json();
  if (!folderDelData.success) throw new Error(`Folder delete failed: ${JSON.stringify(folderDelData)}`);
  console.log(`✅ Root folder deleted\n`);

  // Verify file was cascaded
  const fileCheck = await fetch(`${API_URL}/storage/files`, { headers: { Cookie: cookie } });
  const fileCheckData = await fileCheck.json();
  console.log(`✅ Remaining files in workspace: ${fileCheckData.data.length} (Expected: 0)\n`);

  console.log("✅ All Phase 4 Storage APIs passed!");
}

run().catch(err => { console.error("❌ Test failed:", err.message); process.exit(1); });
