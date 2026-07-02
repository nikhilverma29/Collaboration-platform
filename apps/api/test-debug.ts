import "dotenv/config";
const API_URL = "http://localhost:4000/api";

async function main() {
  const reg = await fetch(`${API_URL}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `ch-${Date.now()}@test.com`, password: "password123", displayName: "Chat Tester" }),
  });
  const regData = await reg.json();
  console.log("[REG STATUS]", reg.status, JSON.stringify(regData));

  const rawCookie = reg.headers.get("set-cookie") || "";
  console.log("[RAW COOKIES]", rawCookie);

  const cookie = rawCookie.split(", ").map(c => c.split(";")[0]).join("; ");
  console.log("[PARSED COOKIE]", cookie);

  const ws = await fetch(`${API_URL}/workspaces`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Chat Corp" }),
  });
  const wsData = await ws.json();
  console.log("[WS STATUS]", ws.status, JSON.stringify(wsData));
}

main().catch(e => console.error("ERROR:", e.message));
