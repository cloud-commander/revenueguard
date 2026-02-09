import { HelpCards } from "@/components/dashboard/HelpCards";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BookOpen,
  Server,
  ShieldCheck,
  Scale,
  TrendingUp,
  Cloud,
} from "lucide-react";

const KBSection = ({ value }: { value: string; title: string; icon: any }) => {
  if (value === "fundamentals") {
    return (
      <div className="grid grid-cols-1 gap-6 max-w-4xl">
        <div className="bg-card rounded-2xl p-4 md:p-6 border border-border shadow-sm">
          <HelpCards category="fundamentals" title="Core Concepts" />
        </div>
        <div className="bg-card rounded-2xl p-4 md:p-6 border border-border shadow-sm space-y-2">
          <h3 className="text-sm font-bold">Demo Runbook (Mock Data)</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
            <li>
              Enable traffic mix (1k SKUs skewed) and keep runs &lt; 100k
              requests.
            </li>
            <li>
              Toggle latency injection (+20–80ms) and payload presets
              (50B/500B/5KB).
            </li>
            <li>
              Flip "Simulate SLO Breach" to show degraded banner (no real SQL
              routing).
            </li>
            <li>
              Watch backpressure panel for per-SKU queue depth; keep WebSockets
              off.
            </li>
            <li>
              Use region pinning toggle for residency narration; config-only, no
              data moves.
            </li>
            <li>
              Cost control: only ~0.01% of simulated requests count toward
              allowance (hard-locked); alert at ~5% and auto-stop at ~10% of
              paid Workers included budget.
            </li>
          </ul>
        </div>
      </div>
    );
  }

  if (value === "architecture") {
    return (
      <div className="grid grid-cols-1 gap-6 max-w-4xl">
        <div className="bg-card rounded-2xl p-4 md:p-6 border border-border shadow-sm">
          <HelpCards category="architecture" title="System Design" />
        </div>
      </div>
    );
  }

  if (value === "security") {
    return (
      <div className="grid grid-cols-1 gap-6 max-w-4xl">
        <div className="bg-card rounded-2xl p-4 md:p-6 border border-border shadow-sm">
          <HelpCards category="security" title="Threat Models" />
        </div>
      </div>
    );
  }

  if (value === "mathematics") {
    return (
      <div className="grid grid-cols-1 gap-6 max-w-4xl">
        <div className="bg-card rounded-2xl p-4 md:p-6 border border-border shadow-sm">
          <HelpCards category="mathematics" title="Simulation Logic" />
        </div>
      </div>
    );
  }

  if (value === "alternatives") {
    return (
      <div className="grid grid-cols-1 gap-6 max-w-4xl">
        <div className="bg-card rounded-2xl p-4 md:p-6 border border-border shadow-sm">
          <HelpCards category="alternatives" title="Market Comparisons" />
        </div>
      </div>
    );
  }

  if (value === "strategy") {
    return (
      <div className="grid grid-cols-1 gap-6 max-w-4xl">
        <div className="bg-card rounded-2xl p-4 md:p-6 border border-border shadow-sm">
          <HelpCards category="strategy" title="Deployment & ROI" />
        </div>
      </div>
    );
  }

  if (value === "cloudflare") {
    return (
      <div className="grid grid-cols-1 gap-6 max-w-4xl">
        <div className="bg-card rounded-2xl p-4 md:p-6 border border-border shadow-sm">
          <HelpCards category="cloudflare" title="Tech Stack Breakdown" />
        </div>
      </div>
    );
  }

  return null;
};

export const KnowledgeBase = () => {
  const sections = [
    { value: "fundamentals", title: "Fundamentals", icon: BookOpen },
    { value: "architecture", title: "Architecture", icon: Server },
    { value: "security", title: "Security", icon: ShieldCheck },
    { value: "mathematics", title: "Mathematics", icon: TrendingUp },
    { value: "alternatives", title: "Comparison", icon: Scale },
    { value: "strategy", title: "Strategy", icon: TrendingUp },
    { value: "cloudflare", title: "Cloudflare Stack", icon: Cloud },
  ];

  return (
    <article
      className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500"
      role="main"
      aria-label="Knowledge Base"
    >
      <header className="flex flex-col gap-2 mb-4">
        <h1 className="text-2xl font-bold tracking-tight">
          System{" "}
          <span className="text-[var(--color-status-success)]">
            Knowledge Base
          </span>
        </h1>
        <p className="text-muted-foreground max-w-2xl leading-relaxed text-sm">
          Deep dive into the architectural concepts, security models, and
          deployment strategies powering this high-concurrency simulation.
        </p>
      </header>

      {/* Desktop View: Tabs */}
      <section className="hidden lg:block">
        <Tabs defaultValue="fundamentals" className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-muted rounded-xl mb-8 h-auto p-1 shadow-sm gap-1">
            {sections.map((s) => (
              <TabsTrigger
                key={s.value}
                value={s.value}
                className="gap-2 rounded-lg py-2.5 px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs"
              >
                <s.icon className="w-3.5 h-3.5" />
                <span>{s.title}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {sections.map((s) => (
            <TabsContent key={s.value} value={s.value} className="mt-0">
              <KBSection value={s.value} title={s.title} icon={s.icon} />
            </TabsContent>
          ))}
        </Tabs>
      </section>

      {/* Mobile View: Accordion */}
      <section className="lg:hidden">
        <Accordion
          type="single"
          collapsible
          defaultValue="fundamentals"
          className="space-y-3"
        >
          {sections.map((s) => (
            <AccordionItem
              key={s.value}
              value={s.value}
              className="bg-card border border-border rounded-2xl overflow-hidden px-4"
            >
              <AccordionTrigger className="hover:no-underline py-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <s.icon className="w-4 h-4 text-[var(--color-status-success)]" />
                  </div>
                  <span className="font-bold text-sm">{s.title}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-6">
                <KBSection value={s.value} title={s.title} icon={s.icon} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </article>
  );
};
