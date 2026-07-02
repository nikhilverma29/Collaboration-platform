import "dotenv/config";
const API_URL = "http://localhost:4000/api";

async function createUser(email: string, displayName: string) {
  const reg = await fetch(`${API_URL}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123", displayName }),
  });
  const data = await reg.json();
  const cookie = reg.headers.get("set-cookie")?.split(", ").map(c => c.split(";")[0]).join("; ") || "";
  return { id: data.data.id, cookie };
}

async function run() {
  console.log("🚀 Phase 7 Layers 3 & 4 — Full Verification (Leaves + Meetings)\n");

  // Setup workspace as CEO
  const ts = Date.now();
  const ceo = await createUser(`ceo-v-${ts}@test.com`, "CEO");
  const ws = await fetch(`${API_URL}/workspaces`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: ceo.cookie },
    body: JSON.stringify({ name: "VerifyCorp" }),
  });
  const workspaceId = (await ws.json()).data.id;
  const sw = await fetch(`${API_URL}/workspaces/${workspaceId}/switch`, { method: "POST", headers: { Cookie: ceo.cookie } });
  const swCookie = sw.headers.get("set-cookie")?.split(", ").find(c => c.startsWith("syncra_access"))?.split(";")[0];
  const refCookie = ceo.cookie.split("; ").find(c => c.startsWith("syncra_refresh"));
  const ceoCookie = `${swCookie}; ${refCookie}`;

  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 7);

  // =====================================================================
  // LAYER 3: LEAVE REQUESTS
  // =====================================================================
  console.log("--- Layer 3: Leave Requests ---");

  // [1] Create leave request
  console.log("[1] Create a leave request...");
  const leaveRes = await fetch(`${API_URL}/calendar/leaves`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: ceoCookie },
    body: JSON.stringify({ startDate: tomorrow.toISOString(), endDate: nextWeek.toISOString(), reason: "Annual Leave" }),
  });
  const leave = (await leaveRes.json()).data;
  if (!leave?.id) throw new Error("Failed to create leave");
  console.log(`✅ Leave created with status: ${leave.status} (Expected: PENDING)`);
  if (leave.status !== "PENDING") throw new Error("Leave status should be PENDING");

  // [2] Fetch leaves
  console.log("[2] Fetch my leaves...");
  const fetchLeaves = await fetch(`${API_URL}/calendar/leaves`, { headers: { Cookie: ceoCookie } });
  const leavesData = (await fetchLeaves.json()).data;
  console.log(`✅ Found ${leavesData.length} leave request(s) (Expected: 1)`);
  if (leavesData.length !== 1) throw new Error("Expected 1 leave");

  // [3] Cannot review own leave (managerId would not match)
  console.log("[3] Trying to review own leave (should fail - not your manager)...");
  const reviewFail = await fetch(`${API_URL}/calendar/leaves/${leave.id}`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: ceoCookie },
    body: JSON.stringify({ status: "APPROVED" }),
  });
  const reviewFailData = await reviewFail.json();
  if (reviewFailData.success) throw new Error("Should not be able to review own leave");
  console.log("✅ Correctly blocked self-review.");

  // [4] Cancel leave
  console.log("[4] Cancel the leave request...");
  const cancelLeave = await fetch(`${API_URL}/calendar/leaves/${leave.id}`, {
    method: "DELETE", headers: { Cookie: ceoCookie },
  });
  const cancelData = await cancelLeave.json();
  if (!cancelData.success) throw new Error("Failed to cancel leave");
  console.log("✅ Leave cancelled successfully.");

  // [5] Leave list should now be empty
  const emptyLeaves = await fetch(`${API_URL}/calendar/leaves`, { headers: { Cookie: ceoCookie } });
  const emptyData = (await emptyLeaves.json()).data;
  if (emptyData.length !== 0) throw new Error("Leave list should be empty after cancel");
  console.log("✅ Leave list is empty after cancellation.");

  // [6] Reject invalid date range
  console.log("[6] Invalid leave (end before start) should fail...");
  const badLeave = await fetch(`${API_URL}/calendar/leaves`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: ceoCookie },
    body: JSON.stringify({ startDate: nextWeek.toISOString(), endDate: tomorrow.toISOString() }),
  });
  const badLeaveData = await badLeave.json();
  if (badLeaveData.success) throw new Error("Should fail for invalid date range");
  console.log("✅ Invalid date range rejected.");

  // =====================================================================
  // LAYER 4: MEETINGS
  // =====================================================================
  console.log("\n--- Layer 4: Meetings ---");

  // [7] Create meeting
  console.log("[7] Create a meeting...");
  const meetRes = await fetch(`${API_URL}/calendar/meetings`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: ceoCookie },
    body: JSON.stringify({ title: "Q3 Planning", startTime: tomorrow.toISOString(), endTime: nextWeek.toISOString(), participantIds: [] }),
  });
  const meeting = (await meetRes.json()).data;
  if (!meeting?.id) throw new Error("Failed to create meeting");
  console.log(`✅ Meeting created: "${meeting.title}"`);

  // [8] Fetch meetings
  console.log("[8] Fetch my meetings...");
  const fetchMeetings = await fetch(`${API_URL}/calendar/meetings`, { headers: { Cookie: ceoCookie } });
  const meetingsData = (await fetchMeetings.json()).data;
  if (meetingsData.length !== 1) throw new Error("Expected 1 meeting");
  console.log("✅ Found 1 meeting.");

  // [9] RSVP
  console.log("[9] RSVP to meeting as TENTATIVE...");
  const rsvpRes = await fetch(`${API_URL}/calendar/meetings/${meeting.id}/rsvp`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: ceoCookie },
    body: JSON.stringify({ status: "TENTATIVE" }),
  });
  const rsvpData = (await rsvpRes.json()).data;
  if (rsvpData.status !== "TENTATIVE") throw new Error("RSVP status mismatch");
  console.log("✅ RSVP set to TENTATIVE.");

  // [10] RSVP with invalid status
  console.log("[10] RSVP with invalid status should fail...");
  const badRsvp = await fetch(`${API_URL}/calendar/meetings/${meeting.id}/rsvp`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: ceoCookie },
    body: JSON.stringify({ status: "MAYBE" }),
  });
  const badRsvpData = await badRsvp.json();
  if (badRsvpData.success) throw new Error("Should reject invalid RSVP status");
  console.log("✅ Invalid RSVP rejected.");

  // [11] Cancel meeting
  console.log("[11] Cancel the meeting...");
  const cancelMeeting = await fetch(`${API_URL}/calendar/meetings/${meeting.id}`, {
    method: "DELETE", headers: { Cookie: ceoCookie },
  });
  const cancelMeetData = await cancelMeeting.json();
  if (!cancelMeetData.success) throw new Error("Failed to cancel meeting");
  console.log("✅ Meeting cancelled successfully.");

  // [12] Meeting list should be empty
  const emptyMeetings = await fetch(`${API_URL}/calendar/meetings`, { headers: { Cookie: ceoCookie } });
  const emptyMeetData = (await emptyMeetings.json()).data;
  if (emptyMeetData.length !== 0) throw new Error("Meeting list should be empty after cancel");
  console.log("✅ Meeting list is empty after cancellation.");

  console.log("\n✅✅ All Layer 3 & 4 verification tests passed!");
}

run().catch(err => { console.error("❌ Test failed:", err.message); process.exit(1); });
