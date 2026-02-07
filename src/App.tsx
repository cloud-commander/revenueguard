import { useSimulation } from "@/hooks/useSimulation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { LoginGate } from "@/components/auth/LoginGate";
import "./App.css";

import { TooltipProvider } from "@/components/ui/tooltip";

function App() {
  const {
    toggleMode,
    toggleLive,
    updateConfig,
    setScenario,
    resetSimulation,
    login,
    logout,
    toggleApiMode,
    session,
    ...state
  } = useSimulation();

  return (
    <TooltipProvider>
      {session ? (
        <DashboardLayout
          state={{ ...state, session }}
          onToggleMode={toggleMode}
          onToggleLive={toggleLive}
          onUpdateConfig={updateConfig}
          onScenarioChange={setScenario}
          onResetSimulation={resetSimulation}
          onToggleApiMode={toggleApiMode}
          onLogout={logout}
          touchInteraction={state.touchInteraction}
        />
      ) : (
        <LoginGate onLogin={login} />
      )}
    </TooltipProvider>
  );
}

export default App;
