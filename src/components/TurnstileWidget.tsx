import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  theme?: "light" | "dark";
}

export const TurnstileWidget = ({
  onVerify,
  theme = "dark",
}: TurnstileWidgetProps) => {
  const [status, setStatus] = useState<"idle" | "verifying" | "success">(
    "idle",
  );

  const startVerification = useCallback(() => {
    if (status !== "idle") return;

    setStatus("verifying");
    setTimeout(
      () => {
        setStatus("success");
        onVerify("mock-token-" + Math.random().toString(36).substring(7));
      },
      800 + Math.random() * 500,
    );
  }, [status, onVerify]);

  useEffect(() => {
    // Auto-verify after a short delay
    const timer = setTimeout(startVerification, 1000);
    return () => clearTimeout(timer);
  }, [startVerification]);

  return (
    <button
      onClick={startVerification}
      disabled={status !== "idle"}
      className={cn(
        "max-w-[300px] w-full h-[65px] rounded border flex items-center px-4 gap-3 transition-all",
        "active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-blue-500/50",
        theme === "dark"
          ? "bg-[#222] border-[#444] text-[#e0e0e0] hover:bg-[#282828]"
          : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50",
        status === "success" &&
          theme === "dark" &&
          "border-green-500/50 bg-[#1a2e1d] cursor-default active:scale-100",
        status === "success" &&
          theme === "light" &&
          "border-green-200 bg-green-50 cursor-default active:scale-100",
        status !== "idle" && "cursor-not-allowed",
      )}
    >
      <div className="w-[28px] h-[28px] flex items-center justify-center">
        {status === "idle" && (
          <div className="w-5 h-5 rounded-sm border-2 border-current opacity-40" />
        )}
        {status === "verifying" && (
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        )}
        {status === "success" && (
          <CheckCircle2 className="w-7 h-7 text-[var(--color-status-success)]" />
        )}
      </div>

      <div className="flex-1 flex flex-col items-start justify-center h-full">
        <span className="text-sm font-medium leading-none">
          {status === "success" ? "Success!" : "Verify you are human"}
        </span>
        {status === "idle" && (
          <span className="text-[10px] opacity-40 mt-1">Click to verify</span>
        )}
      </div>

      <div className="flex flex-col items-center gap-0.5 opacity-50">
        <ShieldCheck className="w-6 h-6" />
        <span className="text-[8px] font-bold uppercase tracking-tighter">
          Cloudflare
        </span>
      </div>
    </button>
  );
};
