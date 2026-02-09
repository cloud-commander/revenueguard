import { Hono } from "hono";
import type { Env } from "../index";
import { getQuotaStatus } from "../services/quota";

// Helper for Session IDs
function genReqId() {
  return `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

const quota = new Hono<{ Bindings: Env }>();

quota.get("/status", async (c) => {
  const reqId = genReqId();
  const authHeader = c.req.header("Authorization")?.split(" ")[1];

  if (!authHeader) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      401,
    );
  }

  const quotaStatus = await getQuotaStatus(c.env);

  return c.json({
    success: true,
    data: quotaStatus,
    meta: { requestId: reqId, timestamp: Date.now() },
  });
});

export default quota;
