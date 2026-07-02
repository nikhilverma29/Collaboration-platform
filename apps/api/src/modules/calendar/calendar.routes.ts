import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireWorkspace } from "../../middleware/tenant";
import { CalendarController } from "./calendar.controller";

const router = Router();

router.use(requireAuth, requireWorkspace);

// Leaves
router.post("/leaves", CalendarController.requestLeave);
router.get("/leaves", CalendarController.getLeaves);
router.put("/leaves/:leaveId", CalendarController.reviewLeave);
router.delete("/leaves/:leaveId", CalendarController.cancelLeave);

// Meetings
router.post("/meetings", CalendarController.createMeeting);
router.get("/meetings", CalendarController.getMeetings);
router.put("/meetings/:meetingId/rsvp", CalendarController.rsvpMeeting);
router.delete("/meetings/:meetingId", CalendarController.cancelMeeting);

export default router;
