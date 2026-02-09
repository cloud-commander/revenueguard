import type { Env } from "../index";

export function genReqId() {
  return `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

export async function getSession(env: Env, sessionId: string) {
  try {
    const data = await env.REVENUE_GUARD_KV.get(sessionId);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error(`Failed to parse session ${sessionId}`, e);
    return null;
  }
}
