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
    const initializedRef = useRef(false);
    const { setTerminal, setSessionId } = useTerminals();

    // Refit terminal when it becomes active (tab selected)
    useEffect(() => {
        if (isActive && fitAddonRef.current) {
            setTimeout(() => fitAddonRef.current?.fit(), 10);
        }
    }, [isActive]);

    // Main initialization effect
    useEffect(() => {
        if (initializedRef.current || !terminalRef.current) return;
        initializedRef.current = true;

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
                setSessionId(session.id, ptyId);

                unlistenOutput = await listen<{ ptyId: string; data: string }>(
                    "pty-output",
                    (event) => {
                        if (event.payload.ptyId === ptyId) {
                            term.write(event.payload.data);
                        }
                    }
                );

                term.onData((data) => {
                    if (sessionIdRef.current) {
                        invoke("write_to_pty", { ptyId: sessionIdRef.current, data }).catch(console.error);
                    }
                });

                term.onResize(({ cols, rows }) => {
                    if (sessionIdRef.current) {
                        invoke("resize_pty", { ptyId: sessionIdRef.current, cols, rows }).catch(console.error);
                    }
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
                term.onData((data) => {
                    if (sessionIdRef.current) {
                        invoke("write_telnet", { sessionId: sessionIdRef.current, data }).catch(console.error);
                    }
                });

                term.write(`\x1b[32mConnected to ${host}:${port}\x1b[0m\r\n\r\n`);

                // Send initial Enter to get the prompt from the router
                setTimeout(() => {
                    if (sessionIdRef.current) {
                        invoke("write_telnet", { sessionId: sessionIdRef.current, data: "\r\n" }).catch(console.error);
                    }
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
