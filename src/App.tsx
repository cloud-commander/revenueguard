import React, { useEffect, useState } from "react";
import type { GymClass, BookingMode, ClassId } from "./types";
import { mockApi } from "./services/mockApi";
import { ClassGrid } from "./components/ClassGrid";
import { BookingPanel } from "./components/BookingPanel";
import { SimulationControls } from "./components/SimulationControls";
import { StatusDisplay } from "./components/StatusDisplay";
import { WebSocketStatus } from "./components/WebSocketStatus";
import { MetricsDisplay } from "./components/MetricsDisplay";
import { ContextualHelp } from "./components/ContextualHelp";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "./hooks/use-toast";

function App() {
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<BookingMode>("safe");
  const [isSimulating, setIsSimulating] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [metrics, setMetrics] = useState({ p99: 0, requests: 0, errors: 0 });
  const [connected, setConnected] = useState(false); // Mock WebSocket
  const { toast } = useToast();

  const fetchState = async (silently = false) => {
    if (!silently) setIsLoading(true);
    const data = await mockApi.getState();
    setClasses(data);
    if (!silently) setIsLoading(false);
  };

  useEffect(() => {
    fetchState();
    // Simulate WebSocket connection
    const timer = setTimeout(() => setConnected(true), 1000);
    const interval = setInterval(() => fetchState(true), 1000); // Polling for mock
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  const handleBook = async (classId: ClassId) => {
    toast({
      title: "Booking request sent...",
      description: `Mode: ${mode.toUpperCase()}`,
    });
    const startTime = performance.now();
    try {
      const res = await (mode === "safe"
        ? mockApi.bookSafe(classId, "user-me")
        : mockApi.bookUnsafe(classId, "user-me"));

      const latency = performance.now() - startTime;
      updateMetrics(latency, !res.success);

      if (res.success) {
        toast({
          title: "Booking Confirmed!",
          description: `Seats remaining: ${res.seatsRemaining}`,
          variant: "default",
        });
      } else {
        toast({
          title: "Booking Failed",
          description: res.message || res.error,
          variant: "destructive",
        });
      }
      fetchState(true);
    } catch {
      toast({
        title: "Error",
        description: "Network error",
        variant: "destructive",
      });
    }
  };

  const handleSimulate = async (count: number) => {
    setIsSimulating(true);
    toast({
      title: "Starting Rush Simulation",
      description: `Spawning ${count} requests...`,
    });

    // Reset metrics for clean run
    setMetrics({ p99: 0, requests: 0, errors: 0 });

    const startTime = performance.now();
    const results = await mockApi.simulateRush("mon-0900", mode, count); // Target specific class for demo
    const totalTime = performance.now() - startTime;

    // Analyze results
    const successCount = results.filter(
      (r) => r.status === "fulfilled" && r.value.success,
    ).length;
    const failures = count - successCount;

    setMetrics((prev) => ({
      ...prev,
      requests: prev.requests + count,
      errors: prev.errors + failures,
      p99: Math.round(totalTime), // Approx
    }));

    toast({
      title: "Simulation Complete",
      description: `Success: ${successCount}, Failed: ${failures}. Total Time: ${Math.round(totalTime)}ms`,
      variant: failures > 0 && mode === "safe" ? "destructive" : "default",
    });

    setIsSimulating(false);
    fetchState(true);
  };

  const handleReset = async () => {
    setIsResetting(true);
    await mockApi.reset();
    await fetchState();
    setMetrics({ p99: 0, requests: 0, errors: 0 });
    toast({ title: "System Reset", description: "All bookings cleared." });
    setIsResetting(false);
  };

  const updateMetrics = (latency: number, isError: boolean) => {
    setMetrics((prev) => ({
      requests: prev.requests + 1,
      errors: prev.errors + (isError ? 1 : 0),
      p99: Math.max(prev.p99, Math.round(latency)),
    }));
  };

  const totalBookings = classes.reduce((sum, c) => sum + c.seatsBooked, 0);
  const totalCapacity = classes.reduce((sum, c) => sum + c.capacity, 0);

  return (
    <TooltipProvider>
      <main className="min-h-screen bg-background text-foreground p-8 pb-32">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-2 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent animate-in fade-in slide-in-from-bottom-4 duration-1000">
                PEAK PASS
              </h1>
              <p className="text-muted-foreground text-lg">
                High-Concurrency Booking Simulation //{" "}
                <span className="text-primary font-mono">v1.0.0-mock</span>
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <WebSocketStatus connected={connected} />
            </div>
          </header>

          {/* Top Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <BookingPanel
              mode={mode}
              setMode={setMode}
              onReset={handleReset}
              isResetting={isResetting}
            />
            <SimulationControls
              onSimulate={handleSimulate}
              isSimulating={isSimulating}
            />
            <StatusDisplay
              totalBookings={totalBookings}
              totalCapacity={totalCapacity}
            />
          </div>
          <ContextualHelp />
          {/* Metrics Grid */}
          <MetricsDisplay metrics={metrics} />
          {/* Main Class Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold tracking-tight">
                Available Classes
              </h2>
              <div className="text-sm text-muted-foreground font-mono">
                REGION: <span className="text-foreground">edge-sim-1</span>
              </div>
            </div>
            <ClassGrid
              classes={classes}
              onBook={handleBook}
              isBooking={isSimulating}
              mode={mode}
              isLoading={isLoading}
            />
          </div>
        </div>
      </main>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
