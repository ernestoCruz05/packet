/**
 * TerminalPanel Component
 * 
 * Renders an individual terminal session using xterm.js.
 * Supports both local PTY sessions and telnet connections to GNS3 devices.
 * Handles communication, resize events, and user input.
 */

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTerminals } from "../context/TerminalContext";
import { TerminalSession } from "../types/terminal";
import { highlightCiscoOutput } from "../utils/ciscoHighlight";
import "@xterm/xterm/css/xterm.css";

// Track which sessions have been initialized to prevent double-spawning
const initializedSessions = new Set<string>();

// Store FitAddon instances globally so they survive React remounts
const fitAddonMap = new Map<string, FitAddon>();

// Store backend session IDs (pty/telnet) globally so they survive React remounts
const backendSessionIdMap = new Map<string, string>();

interface TerminalPanelProps {
    session: TerminalSession;
    isActive: boolean;
}

/**
 * Terminal theme - dark color scheme optimized for network device output
 */
const TERMINAL_THEME = {
    background: "#0d1117",
    foreground: "#c9d1d9",
    cursor: "#58a6ff",
    cursorAccent: "#0d1117",
    selectionBackground: "#264f78",
    black: "#484f58",
    red: "#ff7b72",
    green: "#3fb950",
    yellow: "#d29922",
    blue: "#58a6ff",
    magenta: "#bc8cff",
    cyan: "#39c5cf",
    white: "#b1bac4",
    brightBlack: "#6e7681",
    brightRed: "#ffa198",
    brightGreen: "#56d364",
    brightYellow: "#e3b341",
    brightBlue: "#79c0ff",
    brightMagenta: "#d2a8ff",
    brightCyan: "#56d4dd",
    brightWhite: "#f0f6fc",
};

export function TerminalPanel({ session, isActive }: TerminalPanelProps) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const terminalInstanceRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const { setTerminal, setSessionId } = useTerminals();

    // Refit terminal when it becomes active (tab selected)
    useEffect(() => {
        if (isActive && fitAddonRef.current && terminalInstanceRef.current) {
            // Multiple refit attempts to handle visibility transitions
            const timer1 = setTimeout(() => fitAddonRef.current?.fit(), 10);
            const timer2 = setTimeout(() => fitAddonRef.current?.fit(), 100);
            const timer3 = setTimeout(() => {
                fitAddonRef.current?.fit();
                terminalInstanceRef.current?.focus();
            }, 200);
            return () => {
                clearTimeout(timer1);
                clearTimeout(timer2);
                clearTimeout(timer3);
            };
        }
    }, [isActive]);

    // Main initialization effect
    // Use session.sessionId to check if already connected (survives remounts)
    useEffect(() => {
        if (!terminalRef.current) return;

        // If already initialized, re-attach the existing terminal's DOM to this container
        // This handles React remounting the component with a new DOM element
        if (initializedSessions.has(session.id) && session.terminal) {
            console.log(`[Terminal ${session.id}] Re-attaching existing terminal to new container`);
            terminalInstanceRef.current = session.terminal;

            // Restore fitAddon ref from global map
            const storedFitAddon = fitAddonMap.get(session.id);
            if (storedFitAddon) {
                fitAddonRef.current = storedFitAddon;
            }

            // Restore backend session ID (pty/telnet) from global map
            const storedBackendId = backendSessionIdMap.get(session.id);
            if (storedBackendId) {
                sessionIdRef.current = storedBackendId;
                console.log(`[Terminal ${session.id}] Restored backend session ID: ${storedBackendId}`);
            }

            // xterm stores its rendered DOM in terminal.element
            // We need to move it to the new container div
            const xtermElement = session.terminal.element;
            if (xtermElement && terminalRef.current) {
                // Clear the container and append the existing xterm element
                terminalRef.current.innerHTML = '';
                terminalRef.current.appendChild(xtermElement);

                // Refit after re-attaching
                setTimeout(() => {
                    storedFitAddon?.fit();
                    if (isActive) {
                        session.terminal?.focus();
                    }
                }, 50);
            }
            return;
        }

        // If already in the set but no terminal object, something is wrong - skip
        if (initializedSessions.has(session.id)) {
            console.log(`[Terminal ${session.id}] Already initialized but no terminal object`);
            return;
        }

        // Mark as initialized to prevent re-spawning on remounts
        initializedSessions.add(session.id);

        console.log(`[Terminal ${session.id}] Initializing ${session.connectionType} session...`);

        const terminal = new Terminal({
            cursorBlink: true,
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
            theme: TERMINAL_THEME,
            allowProposedApi: true,
            scrollback: 10000,
            tabStopWidth: 4,
        });

        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();

        terminal.loadAddon(fitAddon);
        terminal.loadAddon(webLinksAddon);

        terminal.open(terminalRef.current);
        fitAddon.fit();

        terminalInstanceRef.current = terminal;
        fitAddonRef.current = fitAddon;
        // Store fitAddon globally so it survives React remounts
        fitAddonMap.set(session.id, fitAddon);
        setTerminal(session.id, terminal);

        let unlistenOutput: (() => void) | null = null;
        let unlistenStatus: (() => void) | null = null;

        if (session.connectionType === "local") {
            // Local PTY session
            initLocalSession(terminal);
        } else if (session.connectionType === "telnet" && session.telnetInfo) {
            // Telnet session to GNS3 device
            initTelnetSession(terminal, session.telnetInfo.host, session.telnetInfo.port);
        }

        async function initLocalSession(term: Terminal) {
            try {
                const ptyId = await invoke<string>("spawn_pty", {
                    cols: term.cols,
                    rows: term.rows,
                });
                console.log(`[Terminal ${session.id}] PTY spawned: ${ptyId}`);

                sessionIdRef.current = ptyId;
                // Store globally so it survives React remounts
                backendSessionIdMap.set(session.id, ptyId);
                setSessionId(session.id, ptyId);

                unlistenOutput = await listen<{ ptyId: string; data: string }>(
                    "pty-output",
                    (event) => {
                        if (event.payload.ptyId === ptyId) {
                            term.write(event.payload.data);
                        }
                    }
                );

                // Use the ptyId directly (captured in closure) instead of ref
                // This ensures input works even after React remounts
                term.onData((data) => {
                    invoke("write_to_pty", { ptyId, data }).catch(console.error);
                });

                term.onResize(({ cols, rows }) => {
                    invoke("resize_pty", { ptyId, cols, rows }).catch(console.error);
                });
            } catch (error) {
                console.error(`[Terminal ${session.id}] Failed to spawn PTY:`, error);
                term.write("\r\n\x1b[31mError: Failed to initialize terminal session\x1b[0m\r\n");
            }
        }

        async function initTelnetSession(term: Terminal, host: string, port: number) {
            term.write(`\x1b[90mConnecting to ${host}:${port}...\x1b[0m\r\n`);

            try {
                const telnetSessionId = await invoke<string>("connect_telnet", { host, port });
                console.log(`[Terminal ${session.id}] Telnet connected: ${telnetSessionId}`);

                sessionIdRef.current = telnetSessionId;
                // Store globally so it survives React remounts
                backendSessionIdMap.set(session.id, telnetSessionId);
                setSessionId(session.id, telnetSessionId);

                // Listen for telnet output with Cisco syntax highlighting
                unlistenOutput = await listen<{ sessionId: string; data: string }>(
                    "telnet-output",
                    (event) => {
                        if (event.payload.sessionId === telnetSessionId) {
                            // Apply Cisco syntax highlighting to the output
                            const highlightedData = highlightCiscoOutput(event.payload.data);
                            term.write(highlightedData);
                        }
                    }
                );

                // Listen for connection status updates
                unlistenStatus = await listen<{ sessionId: string; status: string; message: string }>(
                    "telnet-status",
                    (event) => {
                        if (event.payload.sessionId === telnetSessionId) {
                            if (event.payload.status === "disconnected") {
                                term.write(`\r\n\x1b[33m[Disconnected] ${event.payload.message}\x1b[0m\r\n`);
                            } else if (event.payload.status === "error") {
                                term.write(`\r\n\x1b[31m[Error] ${event.payload.message}\x1b[0m\r\n`);
                            }
                        }
                    }
                );

                // Forward user input to telnet
                // Use telnetSessionId directly (captured in closure) instead of ref
                // This ensures input works even after React remounts
                term.onData((data) => {
                    invoke("write_telnet", { sessionId: telnetSessionId, data }).catch(console.error);
                });

                term.write(`\x1b[32mConnected to ${host}:${port}\x1b[0m\r\n\r\n`);

                // Send initial Enter to get the prompt from the router
                setTimeout(() => {
                    invoke("write_telnet", { sessionId: telnetSessionId, data: "\r\n" }).catch(console.error);
                }, 500);

            } catch (error) {
                console.error(`[Terminal ${session.id}] Failed to connect:`, error);
                term.write(`\r\n\x1b[31mConnection failed: ${error}\x1b[0m\r\n`);
                term.write("\x1b[90mCheck that GNS3 is running and the device is started.\x1b[0m\r\n");
            }
        }

        return () => {
            console.log(`[Terminal ${session.id}] Cleanup called`);
            unlistenOutput?.();
            unlistenStatus?.();
        };
    }, [session.id, session.connectionType, session.telnetInfo]);

    // Handle window resize
    useEffect(() => {
        const handleResize = () => fitAddonRef.current?.fit();
        window.addEventListener("resize", handleResize);

        const resizeObserver = new ResizeObserver(() => {
            setTimeout(() => fitAddonRef.current?.fit(), 0);
        });

        if (terminalRef.current) {
            resizeObserver.observe(terminalRef.current);
        }

        return () => {
            window.removeEventListener("resize", handleResize);
            resizeObserver.disconnect();
        };
    }, []);

    return (
        <div className="terminal-panel-simple">
            <div ref={terminalRef} className="terminal-container" />
        </div>
    );
}
