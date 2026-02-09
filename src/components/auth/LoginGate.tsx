import { useState, useCallback } from "react";
import { TurnstileWidget } from "../TurnstileWidget";
import { ShieldCheck, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface LoginGateProps {
  onLogin: (token: string) => Promise<{ success: boolean; error?: string }>;
}

export const LoginGate = ({ onLogin }: LoginGateProps) => {
  const [error, setError] = useState<string | null>(null);
  const shouldShowFallback =
    !!error &&
    /fetch|network|expected json|backend worker is unreachable|api route not found/i.test(
      error,
    );

  const handleVerify = useCallback(
    async (token: string) => {
      try {
        const result = await onLogin(token);
        if (!result.success) {
          setError(result.error || "Invalid session or verification failed.");
        }
      } catch {
        setError("An unexpected error occurred.");
      }
    },
    [onLogin],
  );

  return (
    <div className="min-h-screen w-full bg-[#050505] flex items-center justify-center p-6 font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,255,102,0.05),transparent_70%)]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md bg-[#111] border border-white/5 rounded-2xl p-8 shadow-2xl overflow-hidden"
      >
        {/* Glow accent */}
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--color-status-success)]/50 to-transparent" />

        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 rounded-xl bg-[var(--color-status-success)]/10 border border-[var(--color-status-success)]/20 flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-[var(--color-status-success)]" />
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-white uppercase">
              Revenue Guard
            </h1>
            <p className="text-sm text-muted-foreground">
              Edge-Atomic Booking Infrastructure Demo
            </p>
          </div>

          <div className="w-full h-[1px] bg-white/5 my-2" />

          <div className="w-full space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                <Lock className="w-3 h-3" />
                Identity Verification
              </div>

              <div className="flex justify-center">
                <TurnstileWidget onVerify={handleVerify} theme="dark" />
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3"
                >
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-500 text-xs text-center">
                    {error}
                  </div>
                  {shouldShowFallback && (
                    <button
                      onClick={() => {
                        window.localStorage.setItem("demo-api-mode", "mock");
                        window.location.reload();
                      }}
                      className="w-full py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-wider hover:bg-blue-500/20 transition-colors"
                    >
                      Force Fallback to Mock Mode
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="text-[10px] text-muted-foreground/50 text-center leading-relaxed italic">
              * This is a zero-cost demonstration. No real billing accounts are
              required. Each session is completely isolated.
            </div>
          </div>
        </div>
      </motion.div>

      {/* Background decoration */}
      <div className="absolute bottom-8 left-8 text-[10px] font-mono text-white/10 uppercase tracking-[0.2em] pointer-events-none">
        Node: global-edge-01
      </div>
      <div className="absolute bottom-8 right-8 text-[10px] font-mono text-white/10 uppercase tracking-[0.2em] pointer-events-none">
        Protocol: secure-atomic-v1
      </div>
    </div>
  );
};
