import { useState, useEffect, useRef, useCallback } from "react";
import { simulationApi } from "@/services/simulationApi";
import { type QuotaStatus, type ThrottleLevel } from "@/types";

interface UseQuotaProps {
  apiMode: "mock" | "live";
  hasSession: boolean;
}

export function useQuota({ apiMode, hasSession }: UseQuotaProps) {
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
  const [throttleLevel, setThrottleLevel] = useState<ThrottleLevel>("normal");
  const quotaPollIntervalRef = useRef<number | null>(null);

  const pollQuotaStatus = useCallback(async () => {
    if (apiMode !== "live" || !hasSession) return;
    try {
      const response = await simulationApi.getQuotaStatus();
      if (response.success && response.data) {
        const quotaData = response.data;
        setQuotaStatus(quotaData);
        setThrottleLevel(quotaData.throttleLevel);

        if (quotaData.throttleLevel === "critical") {
          console.warn(
            "[Quota] Critical threshold reached, consider switching to mock mode",
          );
        }
      }
    } catch (err) {
      console.error("[Quota] Failed to fetch quota status", err);
    }
  }, [apiMode, hasSession]);

  useEffect(() => {
    if (apiMode !== "live" || !hasSession) {
      if (quotaPollIntervalRef.current) {
        clearInterval(quotaPollIntervalRef.current);
        quotaPollIntervalRef.current = null;
      }
      return;
    }

    pollQuotaStatus();

    const getInterval = () => {
      if (throttleLevel === "normal") return 10_000;
      if (throttleLevel === "slow") return 5_000;
      return 3_000;
    };

    quotaPollIntervalRef.current = setInterval(
      () => pollQuotaStatus(),
      getInterval(),
    );

    return () => {
      if (quotaPollIntervalRef.current) {
        clearInterval(quotaPollIntervalRef.current);
        quotaPollIntervalRef.current = null;
      }
    };
  }, [apiMode, hasSession, pollQuotaStatus, throttleLevel]);

  return { quotaStatus, throttleLevel, refreshQuota: pollQuotaStatus };
}
