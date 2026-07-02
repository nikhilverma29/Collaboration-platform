import "dotenv/config";
import { io } from "socket.io-client";
import { SOCKET_EVENTS, SocketEventEnvelope } from "@syncra/validators";

const API_URL = "http://localhost:4000/api";
const SOCKET_URL = "http://localhost:4000";

async function runTests() {
  console.log("🚀 Starting Phase 2.5 Tests (Realtime Event Scaffold)...\n");

  let cookieOwner = "";
  let workspaceId = "";
  
  // 1. Setup User and Workspace
  console.log("[1] Setting up Owner and Workspace via REST...");
  const ownerRes = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `socket-${Date.now()}@example.com`, password: "password123", displayName: "Socket Tester" }),
  });
  cookieOwner = ownerRes.headers.get("set-cookie")?.split(', ').map(c => c.split(';')[0]).join('; ') || "";

  const createRes = await fetch(`${API_URL}/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookieOwner },
    body: JSON.stringify({ name: "Socket Corp" }),
  });
  const createData = await createRes.json();
  workspaceId = createData.data.id;

  // 2. Switch context to get tenant-aware token
  console.log("[2] Switching into workspace context...");
  const switchOwnerRes = await fetch(`${API_URL}/workspaces/${workspaceId}/switch`, { method: "POST", headers: { "Cookie": cookieOwner }});
  const switchOwnerCookie = switchOwnerRes.headers.get("set-cookie")?.split(', ').find(c => c.startsWith('syncra_access'))?.split(';')[0];
  const fullCookie = `${switchOwnerCookie}; ${cookieOwner.split('; ').find(c => c.startsWith('syncra_refresh'))}`;

  // 3. Test 1: Unauthorized Socket Connection (No Cookies)
  console.log("\n[3] Testing Unauthorized Socket Connection...");
  const badSocket = io(SOCKET_URL, { transports: ["polling"], reconnection: false });
  
  await new Promise((resolve, reject) => {
    badSocket.on("connect_error", (err) => {
      console.log(`✅ Passed: Unauthorized connection correctly rejected -> ${err.message}`);
      badSocket.disconnect();
      resolve(true);
    });
    badSocket.on("connect", () => reject(new Error("Socket connected without auth!")));
  });

  // 4. Test 2: Authorized Socket Connection
  console.log("\n[4] Testing Authorized Socket Connection...");
  const socket = io(SOCKET_URL, { 
    transports: ["polling", "websocket"],
    extraHeaders: {
      cookie: fullCookie
    }
  });

  await new Promise((resolve, reject) => {
    socket.on("connect", () => {
      console.log("✅ Passed: Authenticated socket successfully connected!");
      resolve(true);
    });
    socket.on("connect_error", (err) => reject(err));
  });

  // 5. Test 3: Broadcast Delivery
  console.log("\n[5] Testing Broadcast Delivery via REST mutation...");
  
  const eventPromise = new Promise((resolve, reject) => {
    // Listen for the standard event and envelope
    socket.on(SOCKET_EVENTS.WORKSPACE_UPDATED, (envelope: SocketEventEnvelope<any>) => {
      console.log("✅ Received realtime event:", SOCKET_EVENTS.WORKSPACE_UPDATED);
      console.log("   Envelope Meta:", envelope.meta);
      console.log("   Envelope Data:", envelope.data);
      
      if (envelope.meta.workspaceId === workspaceId && envelope.data.name === "Socket Corp Updated") {
        resolve(true);
      } else {
        reject(new Error("Event payload mismatch"));
      }
    });

    // Timeout
    setTimeout(() => reject(new Error("Did not receive socket event within 3 seconds")), 3000);
  });

  // Trigger REST update which should broadcast the event
  await fetch(`${API_URL}/workspaces/${workspaceId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "Cookie": fullCookie },
    body: JSON.stringify({ name: "Socket Corp Updated" }),
  });

  await eventPromise;
  socket.disconnect();

  console.log("\n✅ All Phase 2.5 Socket tests passed successfully!");
}

runTests().catch(err => {
  console.error("\n❌ Test execution failed:", err);
  process.exit(1);
});
