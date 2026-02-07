import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const ContextualHelp = () => {
  return (
    <Card className="border-primary/20 bg-primary/5 backdrop-blur-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          Learning Lab: Systems Architecture
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="race-condition">
            <AccordionTrigger className="text-sm font-semibold hover:text-primary">
              1. What is a Race Condition?
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              A race condition occurs when multiple requests attempt to read and
              A race condition occurs when multiple requests attempt to read and
              write the same data simultaneously. In our "Eventual Consistency"
              path, two edge nodes might both see 1 unit remaining, both approve
              a booking, and then both write back to the database, resulting in
              an overbooked class (Overflow).
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="do-prevention">
            <AccordionTrigger className="text-sm font-semibold hover:text-primary">
              2. How DO Prevents This
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              Cloudflare **Durable Objects (DO)** provide a unique,
              single-threaded execution context for a specific ID (like a class
              ID). Every request for that class is routed to the same DO
              instance and processed sequentially, ensuring that the
              "check-then-decrement" logic is strictly atomic.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="d1-unsafe">
            <AccordionTrigger className="text-sm font-semibold hover:text-primary">
              3. Why We Use D1 for the Eventual Path
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              In this simulation, the "Eventual Consistency" path mimics
              traditional stateless requests hitting a distributed database
              (like D1 or Postgres) without strict coordination. Even with ACID
              transactions, the time-of-check to time-of-use (TOCTOU) gap at
              high concurrency allows race conditions to slip through if not
              guarded by explicit serialization.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="do-storage">
            <AccordionTrigger className="text-sm font-semibold hover:text-primary">
              4. Understanding Durable Object Storage
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              Durable Objects maintain state in a persistent KV store that is
              physically co-located with the running code. This provides
              low-latency access to consistent state, making it ideal for
              high-concurrency coordination like transactional booking systems.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="ws-hibernation">
            <AccordionTrigger className="text-sm font-semibold hover:text-primary">
              5. WebSocket Hibernation & Auto-Cleanup
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              Cloudflare workers can "hibernate" WebSockets, saving memory costs
              when no messages are being sent. The system automatically shuts
              down idle DO instances, ensuring zero-cost maintenance when the
              simulation is not active.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
};
