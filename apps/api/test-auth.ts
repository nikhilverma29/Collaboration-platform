import "dotenv/config";
const API_URL = "http://localhost:4000/api/auth";

async function runTests() {
  console.log("🚀 Starting Auth Tests...");

  let cookieHeader = "";

  // 1. Register
  console.log("\n[1] Testing /register...");
  const registerRes = await fetch(`${API_URL}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `test-${Date.now()}@example.com`,
      password: "password123",
      displayName: "Test User",
    }),
  });
  
  const registerData = await registerRes.json();
  console.log("Register Response:", registerData);
  
  if (!registerData.success) {
    console.error("❌ Register failed");
    process.exit(1);
  }
  
  const setCookie = registerRes.headers.get("set-cookie");
  if (setCookie) {
    // Basic extraction for fetch client
    cookieHeader = setCookie.split(', ').map(c => c.split(';')[0]).join('; ');
    console.log("Cookies received:", cookieHeader);
  }

  // 2. Login
  console.log("\n[2] Testing /login...");
  const loginRes = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: registerData.data.email,
      password: "password123",
    }),
  });
  
  const loginData = await loginRes.json();
  console.log("Login Response:", loginData);
  
  if (!loginData.success) {
    console.error("❌ Login failed");
    process.exit(1);
  }
  
  const loginCookies = loginRes.headers.get("set-cookie");
  if (loginCookies) {
    cookieHeader = loginCookies.split(', ').map(c => c.split(';')[0]).join('; ');
  }

  // 3. Refresh
  console.log("\n[3] Testing /refresh...");
  const refreshRes = await fetch(`${API_URL}/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": cookieHeader
    },
  });
  
  const refreshData = await refreshRes.json();
  console.log("Refresh Response:", refreshData);
  
  if (!refreshData.success) {
    console.error("❌ Refresh failed");
    process.exit(1);
  }

  const refreshCookies = refreshRes.headers.get("set-cookie");
  if (refreshCookies) {
    cookieHeader = refreshCookies.split(', ').map(c => c.split(';')[0]).join('; ');
  }

  // 4. Logout
  console.log("\n[4] Testing /logout...");
  const logoutRes = await fetch(`${API_URL}/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": cookieHeader
    },
  });
  
  const logoutData = await logoutRes.json();
  console.log("Logout Response:", logoutData);
  
  if (!logoutData.success) {
    console.error("❌ Logout failed");
    process.exit(1);
  }

  console.log("\n✅ All Auth tests passed successfully!");
}

runTests().catch(console.error);
