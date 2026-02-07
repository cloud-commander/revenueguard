import React, {
  cloneElement,
  isValidElement,
  useId,
  useState,
  useRef,
  useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface EducationalTooltipProps {
  children: React.ReactNode;
  title: string;
  explanation: string;
  technicalDetail?: string;
  status?: "info" | "alert" | "success" | "pending";
}

export const EducationalTooltip = ({
  children,
  title,
  explanation,
  technicalDetail,
  status = "info",
}: EducationalTooltipProps) => {
  const tooltipId = useId();
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const statusColors = {
    info: "border-blue-500/50 text-blue-600 dark:text-blue-400 dark:border-blue-400/50",
    alert:
      "border-[var(--color-status-alert)] text-[var(--color-status-alert)]",
    success:
      "border-[var(--color-status-success)] text-[var(--color-status-success)]",
    pending:
      "border-[var(--color-status-pending)] text-[var(--color-status-pending)]",
  };

  const statusGlow = {
    info: "shadow-[0_0_15px_rgba(100,150,255,0.2)]",
    alert: "shadow-[0_0_15px_rgba(255,100,100,0.2)]",
    success: "shadow-[0_0_15px_rgba(100,255,130,0.2)]",
    pending: "shadow-[0_0_15px_rgba(255,200,100,0.2)]",
  };

  const withMergedHandlers = (
    child: React.ReactElement,
    handlers: Record<string, (event: React.SyntheticEvent) => void>,
  ) => {
    const childProps = child.props as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...childProps };

    Object.entries(handlers).forEach(([key, handler]) => {
      const existing = childProps[key];
      merged[key] = (event: React.SyntheticEvent) => {
        if (typeof existing === "function") (existing as Function)(event);
        handler(event);
      };
    });

    const describedBy = childProps["aria-describedby"] as string | undefined;
    merged["aria-describedby"] = describedBy
      ? `${describedBy} ${tooltipId}`
      : tooltipId;

    return cloneElement(child, merged);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsVisible(false);
      }
    };

    if (isVisible) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isVisible]);

  const toggleVisibility = (_e: React.SyntheticEvent) => {
    // Only toggle on tap/click if it's likely a mobile device or explicit click
    setIsVisible(!isVisible);
  };

  const childWithA11y = isValidElement(children)
    ? withMergedHandlers(children, {
        onFocus: () => setIsVisible(true),
        onBlur: () => setIsVisible(false),
        onClick: (e: React.SyntheticEvent) => {
          e.stopPropagation();
          toggleVisibility(e);
        },
      })
    : children;

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center group/edu"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocusCapture={() => setIsVisible(true)}
      onBlurCapture={() => setIsVisible(false)}
      aria-describedby={tooltipId}
    >
      <div className="flex items-center gap-1.5 w-full">
        <div className="flex-1">{childWithA11y}</div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleVisibility(e);
          }}
          className={cn(
            "lg:hidden p-1 rounded-full hover:bg-muted transition-colors shrink-0",
            isVisible ? "text-foreground" : "text-muted-foreground",
          )}
          aria-label={`Get information about ${title}`}
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </div>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.2, delay: 0.3 }}
            className={cn(
              "absolute z-[100] bottom-full mb-3 w-64 p-4 bg-card/95 backdrop-blur-xl border border-border rounded-lg shadow-2xl pointer-events-none",
              statusColors[status],
              statusGlow[status],
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider">
                {title}
              </span>
            </div>
            <div className="h-[1px] w-full bg-border mb-2" />
            <p className="text-foreground text-xs leading-relaxed mb-2">
              {explanation}
            </p>
            {technicalDetail && (
              <p className="text-muted-foreground text-[10px] font-mono leading-tight">
                {technicalDetail}
              </p>
            )}
            {/* Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-card/95" />
            <div className="sr-only" id={tooltipId}>
              {`${title}: ${explanation}${technicalDetail ? `. ${technicalDetail}` : ""}`}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
