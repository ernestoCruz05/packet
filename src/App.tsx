/**
 * Packet - Multi-Terminal Broadcast Application
 * 
 * A professional terminal multiplexer with broadcast capabilities,
 * designed for network engineers and system administrators.
 * 
 * @author faky
 * @version 0.1.0
 */

import { TerminalProvider } from "./context/TerminalContext";
import { TerminalGrid } from "./components/TerminalGrid";
import { BroadcastInput } from "./components/BroadcastInput";
import { TitleBar } from "./components/TitleBar";
import "./App.css";

/**
 * Main Application Component
 * 
 * Provides the root layout structure with:
 * - Main: Tabbed terminal workspace
 * - Footer: Broadcast command input panel
 */
function App() {
  return (
    <TerminalProvider>
      <div className="app">
        <TitleBar />

        <main className="app-main">
          <TerminalGrid />
        </main>

        <footer className="app-footer">
          <BroadcastInput />
        </footer>
      </div>
    </TerminalProvider>
  );
}

export default App;
