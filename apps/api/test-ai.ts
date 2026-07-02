import "dotenv/config";
const API_URL = "http://localhost:4000/api";

async function createAndSwitchUser(email: string, displayName: string) {
  const reg = await fetch(`${API_URL}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123", displayName }),
  });
  const regData = await reg.json();
  let cookie = reg.headers.get("set-cookie")?.split(", ").map((c: string) => c.split(";")[0]).join("; ") || "";
  
  const ws = await fetch(`${API_URL}/workspaces`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "AI Corp" }),
  });
  const wsId = (await ws.json()).data.id;

  const sw = await fetch(`${API_URL}/workspaces/${wsId}/switch`, { method: "POST", headers: { Cookie: cookie } });
  const swCookie = sw.headers.get("set-cookie")?.split(", ").find((c: string) => c.startsWith("syncra_access"))?.split(";")[0];
  const refCookie = cookie.split("; ").find((c: string) => c.startsWith("syncra_refresh"));
  return { id: regData.data.id, cookie: `${swCookie}; ${refCookie}`, workspaceId: wsId };
}

async function run() {
  console.log("🚀 Phase 8 Layers 1 & 2 — AI Copilot\n");

  if (!process.env.OPENAI_API_KEY) {
    console.warn("⚠️ OPENAI_API_KEY is not set. Skipping actual AI generation tests.");
    return;
  }

  const ts = Date.now();
  const user = await createAndSwitchUser(`ai-user-${ts}@test.com`, "AI Tester");

  // =====================================================================
  // LAYER 1: STREAMING CHAT
  // =====================================================================
  console.log("--- Layer 1: Streaming Chat ---");

  // [1] Test chat endpoint
  console.log("[1] Sending chat message...");
  const chatRes = await fetch(`${API_URL}/ai/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: user.cookie },
    body: JSON.stringify({ messages: [{ role: "user", content: "Say the word 'Hello'" }] }),
  });
  
  if (!chatRes.ok) {
    const text = await chatRes.text();
    throw new Error(`Chat request failed: ${chatRes.status} ${text}`);
  }

  // Read the stream
  const reader = chatRes.body?.getReader();
  let chatOutput = "";
  if (reader) {
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chatOutput += decoder.decode(value, { stream: true });
    }
  }
  console.log(`✅ Received stream response (length: ${chatOutput.length})`);
  console.log(`   Sample: ${chatOutput.substring(0, 50).replace(/\n/g, "\\n")}...`);

  // =====================================================================
  // LAYER 2: MESSAGE SUMMARIZATION
  // =====================================================================
  console.log("\n--- Layer 2: Message Summarization ---");

  // [2] Create a channel and some messages
  console.log("[2] Setup: creating channel and messages...");
  const chRes = await fetch(`${API_URL}/channels`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: user.cookie },
    body: JSON.stringify({ name: "ai-test", type: "PUBLIC" }),
  });
  const channel = (await chRes.json()).data;

  await fetch(`${API_URL}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: user.cookie },
    body: JSON.stringify({ channelId: channel.id, content: "We need to decide on the new logo color." }),
  });
  await fetch(`${API_URL}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: user.cookie },
    body: JSON.stringify({ channelId: channel.id, content: "I think blue is best for trust." }),
  });
  await fetch(`${API_URL}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: user.cookie },
    body: JSON.stringify({ channelId: channel.id, content: "Agreed, let's go with blue." }),
  });

  // [3] Summarize the channel
  console.log("[3] Requesting channel summary...");
  const sumRes = await fetch(`${API_URL}/ai/summarize/channel/${channel.id}`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: user.cookie },
  });
  const sumData = await sumRes.json();
  if (!sumData.success) throw new Error("Summarization failed: " + JSON.stringify(sumData.error));
  
  console.log(`✅ Summary received: "${sumData.data.summary}"`);

  console.log("\n✅✅ All Layer 1 & 2 verification tests passed!");
}

run().catch(err => { console.error("❌ Test failed:", err.message); process.exit(1); });
