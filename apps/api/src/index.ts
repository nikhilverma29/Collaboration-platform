import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { createServer } from "http";

import authRoutes from "./modules/auth/auth.routes";
import workspaceRoutes from "./modules/workspace/workspace.routes";
import projectRoutes from "./modules/project/project.routes";
import taskRoutes from "./modules/project/task.routes";
import storageRoutes from "./modules/storage/storage.routes";
import channelRoutes from "./modules/chat/channel.routes";
import messageRoutes from "./modules/chat/message.routes";
import searchRoutes from "./modules/search/search.routes";
import orgRoutes from "./modules/org/org.routes";
import calendarRoutes from "./modules/calendar/calendar.routes";
import presenceRoutes from "./modules/presence/presence.routes";
import aiRoutes from "./modules/ai/ai.routes";
import userRoutes from "./modules/user/user.routes";
import notificationRoutes from "./modules/notification/notification.routes";
import { SocketService } from "./modules/socket/socket.service";

// ---------------------------------------------------------------------------
// App bootstrap
// ---------------------------------------------------------------------------

const app = express();
const PORT = process.env["PORT"] ?? 4000;
const httpServer = createServer(app);

// ---------------------------------------------------------------------------
// Security middleware
// ---------------------------------------------------------------------------

app.use(helmet());

app.use(
  cors({
    origin: process.env["CLIENT_URL"] ?? "http://localhost:5173",
    credentials: true, // required for HTTP-only cookie transport
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, error: "Too many requests — please try again later." },
  })
);

// ---------------------------------------------------------------------------
// Body / cookie parsing
// ---------------------------------------------------------------------------

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/storage", storageRoutes);
app.use("/api/channels", channelRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/org", orgRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/presence", presenceRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/notifications", notificationRoutes);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Syncra API is running.",
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

SocketService.init(httpServer);

httpServer.listen(PORT, () => {
  console.log(`\n🚀  Syncra API  →  http://localhost:${PORT}`);
  console.log(`🛡️   Environment: ${process.env["NODE_ENV"] ?? "development"}\n`);
});

// ---------------------------------------------------------------------------
// Global Error Handler — catches any error thrown from routes/services
// Must be LAST middleware. Prevents raw Express HTML error pages being returned.
// ---------------------------------------------------------------------------

app.use((err: any, _req: any, res: any, _next: any) => {
  const status = err.status ?? err.statusCode ?? 500;
  const message =
    process.env["NODE_ENV"] === "production"
      ? "An unexpected error occurred"
      : (err.message ?? "Internal Server Error");

  res.status(status).json({ success: false, error: message });
});

// ---------------------------------------------------------------------------
// Process-level safety nets (catch unhandled rejections that escape express)
// ---------------------------------------------------------------------------

process.on("unhandledRejection", (reason: any) => {
  console.error("[FATAL] Unhandled Promise Rejection:", reason?.message ?? reason);
  // Do NOT crash the server in production — log and continue
});

process.on("uncaughtException", (err: Error) => {
  console.error("[FATAL] Uncaught Exception:", err.message);
  // For uncaught exceptions, a clean restart is safest — exit with error code
  process.exit(1);
});

export default app;
