import type { Env } from "../index";

export interface QuotaConfig {
  cpuLimitMs: number;
  throttleSlowThreshold: number;
  throttleCriticalThreshold: number;
  cpuLoginMs: number;
  cpuAllocateMs: number;
  cpuStateMs: number;
}

export function getQuotaConfig(env: Env): QuotaConfig {
  return {
    cpuLimitMs: parseInt(env.QUOTA_CPU_MS || "30000000", 10),
    throttleSlowThreshold: parseFloat(env.QUOTA_SLOW_THRESHOLD || "0.5"),
    throttleCriticalThreshold: parseFloat(
      env.QUOTA_CRITICAL_THRESHOLD || "0.8",
    ),
    cpuLoginMs: parseInt(env.QUOTA_CPU_LOGIN_MS || "50", 10),
    cpuAllocateMs: parseInt(env.QUOTA_CPU_ALLOCATE_MS || "50", 10),
    cpuStateMs: parseInt(env.QUOTA_CPU_STATE_MS || "20", 10),
  };
}

export function getQuotaKey() {
  const now = new Date();
  return `quota:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function getQuotaStatus(env: Env) {
  const config = getQuotaConfig(env);
  const quotaKey = getQuotaKey();
  const data = await env.REVENUE_GUARD_KV.get(quotaKey);
  const cpuUsedMs = data ? parseInt(data, 10) : 0;
  const cpuRemainingMs = Math.max(0, config.cpuLimitMs - cpuUsedMs);
  const percentageUsed = Math.round((cpuUsedMs / config.cpuLimitMs) * 100);

  let throttleLevel: "normal" | "slow" | "critical" = "normal";
  const usageRatio = cpuUsedMs / config.cpuLimitMs;
  if (usageRatio >= config.throttleCriticalThreshold) {
    throttleLevel = "critical";
  } else if (usageRatio >= config.throttleSlowThreshold) {
    throttleLevel = "slow";
  }

  return {
    cpuUsedMs,
    cpuRemainingMs,
    cpuLimitMs: config.cpuLimitMs,
    throttleLevel,
    percentageUsed,
  };
}

export async function recordCpuUsage(env: Env, cpuMs: number) {
  if (Math.random() > 0.1) return;

  const quotaKey = getQuotaKey();
  const status = await getQuotaStatus(env);
  const newUsage = status.cpuUsedMs + cpuMs * 10;
  await env.REVENUE_GUARD_KV.put(quotaKey, newUsage.toString(), {
    expirationTtl: 2_592_000, // 30 days
  });
}
