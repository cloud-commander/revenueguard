import { cn } from "@/lib/utils";
import { DISABLE_LIVE_ENGINE } from "@/config/simulationDefaults";
import {
  LayoutDashboard,
  BookOpen,
  Activity,
  ShieldCheck,
  Database,
  HardDrive,
  LogOut,
} from "lucide-react";

export type ViewState = "monitor" | "session" | "telemetry" | "knowledge";

interface SidebarProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  apiMode: "mock" | "live";
  onToggleApiMode: () => void;
  onLogout?: () => void;
  onLegalClick?: () => void;
  className?: string; // For hiding on mobile if needed
}

export const Sidebar = ({
  currentView,
  onNavigate,
  apiMode,
  onToggleApiMode,
  onLogout,
  onLegalClick,
  className,
}: SidebarProps) => {
  const navItems = [
    { id: "monitor", label: "Monitor", icon: LayoutDashboard },
    { id: "session", label: "Session Status", icon: ShieldCheck },
    { id: "telemetry", label: "Telemetry", icon: Activity },
    { id: "knowledge", label: "Knowledge", icon: BookOpen },
  ];

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-card border-r border-border",
        className,
      )}
      aria-label="Main Navigation"
    >
      {/* Branding Header */}
      <header className="p-6 border-b border-border">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-500",
              apiMode === "live"
                ? "bg-[var(--color-engine-accent)]"
                : "bg-[var(--color-status-success)]",
            )}
          >
            <LayoutDashboard className="w-5 h-5 text-black" />
          </div>
          <div className="flex flex-col leading-none">
            <h1 className="font-bold text-lg tracking-tight">Revenue</h1>
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
              Guard
            </span>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        <div className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-wider mb-4 px-2">
          Platform
        </div>
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as ViewState)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? apiMode === "live"
                    ? "bg-[var(--color-engine-accent)]/10 text-[var(--color-engine-accent)]"
                    : "bg-[var(--color-status-success)]/10 text-[var(--color-status-success)]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer / Status Area */}
      <footer className="p-4 border-t border-border bg-muted/20 space-y-4">
        {!DISABLE_LIVE_ENGINE && (
          <div className="space-y-2">
            <div className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-wider px-2">
              API Environment
            </div>
            <button
              onClick={onToggleApiMode}
              aria-label={`Switch to ${apiMode === "live" ? "Mock Engine" : "Live Worker"}`}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all border",
                apiMode === "live"
                  ? "bg-[var(--color-engine-accent)]/10 text-[var(--color-engine-accent)] border-[var(--color-engine-accent)]/20"
                  : "bg-muted text-muted-foreground border-transparent hover:border-border",
              )}
            >
              <div className="flex items-center gap-2">
                {apiMode === "live" ? (
                  <Database className="w-3.5 h-3.5" />
                ) : (
                  <HardDrive className="w-3.5 h-3.5" />
                )}
                {apiMode === "live" ? "Live Worker" : "Mock Engine"}
              </div>
              <span className="text-[8px] opacity-50 uppercase tracking-widest">
                Switch
              </span>
            </button>
          </div>
        )}

        {onLogout && (
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout Session
          </button>
        )}

        <div className="flex flex-col gap-1 text-[10px] text-muted-foreground text-center pt-2 opacity-70">
          <span>Educational Simulation • Community Project</span>
          {onLegalClick && (
            <button
              onClick={onLegalClick}
              className="text-[10px] font-semibold uppercase tracking-[0.3em] hover:underline"
            >
              Legal Disclaimer
            </button>
          )}
        </div>
      </footer>
    </aside>
  );
};
