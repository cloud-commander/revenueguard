import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

console.log("Main entry point executing");
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    {/* <h1>Hello World Debug</h1> */}
  </StrictMode>,
);
