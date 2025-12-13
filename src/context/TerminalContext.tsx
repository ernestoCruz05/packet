/**
 * Terminal Context Provider
 * 
 * Manages global state for all terminal sessions including:
 * - Session lifecycle (create, remove) for local and telnet connections
 * - Broadcast toggle state
 * - Session ID associations (PTY or telnet)
 * - Command broadcasting to multiple terminals
 * 
 * Uses a ref pattern to avoid stale closure issues with async operations.
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Terminal } from "@xterm/xterm";
import { TerminalSession, TerminalState } from "../types/terminal";
import { invoke } from "@tauri-apps/api/core";

const TerminalContext = createContext<TerminalState | null>(null);

/**
 * Hook to access terminal state and actions
 * Must be used within a TerminalProvider
 */
export function useTerminals(): TerminalState {
    const context = useContext(TerminalContext);
    if (!context) {
        throw new Error("useTerminals must be used within a TerminalProvider");
    }
    return context;
}

interface TerminalProviderProps {
    children: React.ReactNode;
}

export function TerminalProvider({ children }: TerminalProviderProps) {
    const [sessions, setSessions] = useState<TerminalSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

    // Use a ref to always have access to the latest sessions
    // This prevents stale closure issues in broadcastCommand
    const sessionsRef = useRef<TerminalSession[]>(sessions);

    // Keep the ref in sync with state
    useEffect(() => {
        sessionsRef.current = sessions;
    }, [sessions]);

    /**
     * Sets the currently active terminal session
     */
    const setActiveSession = useCallback((id: string) => {
        setActiveSessionId(id);
    }, []);

    /**
     * Creates a new local terminal session (bash/shell)
     * The PTY will be spawned when the TerminalPanel mounts
     */
    const addSession = useCallback(() => {
        const id = uuidv4();
        const newSession: TerminalSession = {
            id,
            name: `Terminal ${sessionsRef.current.length + 1}`,
            connectionType: "local",
            broadcastEnabled: true,
            terminal: null,
            sessionId: null,
        };
        setSessions((prev) => [...prev, newSession]);
        setActiveSessionId(id);
    }, []);

    /**
     * Creates a new telnet session to a GNS3 device
     */
    const addTelnetSession = useCallback((host: string, port: number, name?: string) => {
        const id = uuidv4();
        const displayName = name || `${host}:${port}`;
        const newSession: TerminalSession = {
            id,
            name: displayName,
            connectionType: "telnet",
            telnetInfo: { host, port },
            broadcastEnabled: true,
            terminal: null,
            sessionId: null,
        };
        setSessions((prev) => [...prev, newSession]);
        setActiveSessionId(id);
    }, []);

    /**
     * Removes a terminal session and cleans up its backend connection
     */
    const removeSession = useCallback((id: string) => {
        setSessions((prev) => {
            const session = prev.find((s) => s.id === id);
            if (session?.sessionId) {
                // Clean up backend session based on connection type
                if (session.connectionType === "local") {
                    invoke("kill_pty", { ptyId: session.sessionId }).catch(console.error);
                } else if (session.connectionType === "telnet") {
                    invoke("disconnect_telnet", { sessionId: session.sessionId }).catch(console.error);
                }
            }
            const remaining = prev.filter((s) => s.id !== id);

            // If we're removing the active session, switch to another
            if (id === activeSessionId && remaining.length > 0) {
                const idx = prev.findIndex((s) => s.id === id);
                const newActiveIdx = Math.min(idx, remaining.length - 1);
                setActiveSessionId(remaining[newActiveIdx]?.id ?? null);
            } else if (remaining.length === 0) {
                setActiveSessionId(null);
            }

            return remaining;
        });
    }, [activeSessionId]);

    /**
     * Toggles whether a terminal receives broadcast commands
     */
    const toggleBroadcast = useCallback((id: string) => {
        setSessions((prev) =>
            prev.map((s) =>
                s.id === id ? { ...s, broadcastEnabled: !s.broadcastEnabled } : s
            )
        );
    }, []);

    /**
     * Updates the display name of a terminal session
     */
    const updateSessionName = useCallback((id: string, name: string) => {
        setSessions((prev) =>
            prev.map((s) => (s.id === id ? { ...s, name } : s))
        );
    }, []);

    /**
     * Associates an xterm.js Terminal instance with a session
     */
    const setTerminal = useCallback((id: string, terminal: Terminal) => {
        setSessions((prev) =>
            prev.map((s) => (s.id === id ? { ...s, terminal } : s))
        );
    }, []);

    /**
     * Associates a backend session ID (PTY or telnet) with a session
     */
    const setSessionId = useCallback((id: string, sessionId: string) => {
        setSessions((prev) =>
            prev.map((s) => (s.id === id ? { ...s, sessionId } : s))
        );
    }, []);

    /**
     * Broadcasts a single keystroke to all terminals with broadcast enabled
     * Works with both local PTY and telnet sessions
     */
    const broadcastKeystroke = useCallback((key: string) => {
        const currentSessions = sessionsRef.current;

        currentSessions.forEach((session) => {
            if (session.broadcastEnabled && session.sessionId) {
                if (session.connectionType === "local") {
                    invoke("write_to_pty", {
                        ptyId: session.sessionId,
                        data: key,
                    }).catch((err) => console.error(`[Broadcast] Failed to send to ${session.name}:`, err));
                } else if (session.connectionType === "telnet") {
                    invoke("write_telnet", {
                        sessionId: session.sessionId,
                        data: key,
                    }).catch((err) => console.error(`[Broadcast] Failed to send to ${session.name}:`, err));
                }
            }
        });
    }, []);

    const value: TerminalState = {
        sessions,
        activeSessionId,
        addSession,
        addTelnetSession,
        removeSession,
        setActiveSession,
        toggleBroadcast,
        updateSessionName,
        setTerminal,
        setSessionId,
        broadcastKeystroke,
    };

    return (
        <TerminalContext.Provider value={value}>
            {children}
        </TerminalContext.Provider>
    );
}
