/**
 * Terminal Context Provider
 * 
 * Manages global state for all terminal sessions including:
 * - Session lifecycle (create, remove) for local and telnet connections
 * - Broadcast toggle state
 * - Session ID associations (PTY or telnet)
 * - Command broadcasting to multiple terminals
 * - Tab groups for organizing terminals
 * 
 * Uses a ref pattern to avoid stale closure issues with async operations.
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Terminal } from "@xterm/xterm";
import { TerminalSession, TerminalState, LayoutMode, TabGroup } from "../types/terminal";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Predefined colors for groups */
const GROUP_COLORS = [
    "#58a6ff", // Blue
    "#3fb950", // Green
    "#d29922", // Yellow
    "#f85149", // Red
    "#a371f7", // Purple
    "#79c0ff", // Light blue
    "#56d364", // Light green
    "#e3b341", // Orange
];

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
    const [groups, setGroups] = useState<TabGroup[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
    const [layoutMode, setLayoutMode] = useState<LayoutMode>("tabs");
    const startupChecked = useRef(false);

    // Use a ref to always have access to the latest sessions
    // This prevents stale closure issues in broadcastCommand
    const sessionsRef = useRef<TerminalSession[]>(sessions);

    // Keep the ref in sync with state
    useEffect(() => {
        sessionsRef.current = sessions;
    }, [sessions]);

    /**
     * Check for CLI arguments on startup (GNS3 integration)
     * If packet was launched with --host --port, auto-connect
     */
    useEffect(() => {
        if (startupChecked.current) return;
        startupChecked.current = true;

        const checkCliConnection = async () => {
            try {
                const connection = await invoke<{ name: string; host: string; port: number } | null>(
                    "get_cli_connection"
                );

                if (connection) {
                    console.log("[Startup] CLI connection requested:", connection);
                    // Add telnet session from CLI args
                    const id = uuidv4();
                    const newSession: TerminalSession = {
                        id,
                        name: connection.name,
                        connectionType: "telnet",
                        telnetInfo: { host: connection.host, port: connection.port },
                        broadcastEnabled: true,
                        terminal: null,
                        sessionId: null,
                        groupId: null,
                    };
                    setSessions([newSession]);
                    setActiveSessionId(id);
                }
            } catch (error) {
                console.error("[Startup] Failed to check CLI connection:", error);
            }
        };

        checkCliConnection();
    }, []);

    /**
     * Listen for new-connection events from single-instance plugin
     * When a second instance is launched with CLI args, it sends those args
     * to the already-running instance via this event
     */
    useEffect(() => {
        const setupListener = async () => {
            const unlisten = await listen<{ name: string; host: string; port: number }>(
                "new-connection",
                (event) => {
                    console.log("[SingleInstance] New connection received:", event.payload);
                    const { name, host, port } = event.payload;

                    // Create a new telnet session
                    const id = uuidv4();
                    const newSession: TerminalSession = {
                        id,
                        name,
                        connectionType: "telnet",
                        telnetInfo: { host, port },
                        broadcastEnabled: true,
                        terminal: null,
                        sessionId: null,
                        groupId: activeGroupId, // Add to current group if any
                    };
                    setSessions((prev) => [...prev, newSession]);
                    setActiveSessionId(id);
                }
            );

            return unlisten;
        };

        const unlistenPromise = setupListener();

        return () => {
            unlistenPromise.then((unlisten) => unlisten());
        };
    }, [activeGroupId]);

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
    const addSession = useCallback((groupId: string | null = null) => {
        const id = uuidv4();
        const newSession: TerminalSession = {
            id,
            name: `Terminal ${sessionsRef.current.length + 1}`,
            connectionType: "local",
            broadcastEnabled: true,
            terminal: null,
            sessionId: null,
            groupId: groupId ?? activeGroupId,
        };
        setSessions((prev) => [...prev, newSession]);
        setActiveSessionId(id);
    }, [activeGroupId]);

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
            groupId: activeGroupId,
        };
        setSessions((prev) => [...prev, newSession]);
        setActiveSessionId(id);
    }, [activeGroupId]);

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
     * Broadcasts a single keystroke to terminals with broadcast enabled
     * Supports optional group filtering for vim-style commands
     * @param key - The keystroke to send
     * @param groupId - Optional: undefined = all, null = all, string = specific group only
     */
    const broadcastKeystroke = useCallback((key: string, groupId?: string | null) => {
        const currentSessions = sessionsRef.current;

        currentSessions.forEach((session) => {
            // Check if session is broadcast enabled
            if (!session.broadcastEnabled || !session.sessionId) return;

            // If groupId is provided (not undefined), filter by group
            if (groupId !== undefined && session.groupId !== groupId) return;

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
        });
    }, []);

    /**
     * Toggles between tabs and grid layout mode
     */
    const toggleLayoutMode = useCallback(() => {
        setLayoutMode((prev) => (prev === "tabs" ? "grid" : "tabs"));
    }, []);

    /**
     * Creates a new tab group
     */
    const addGroup = useCallback((name: string) => {
        const id = uuidv4();
        const colorIndex = groups.length % GROUP_COLORS.length;
        const newGroup: TabGroup = {
            id,
            name,
            color: GROUP_COLORS[colorIndex],
        };
        setGroups((prev) => [...prev, newGroup]);
        setActiveGroupId(id);
    }, [groups.length]);

    /**
     * Removes a tab group and ungroups its sessions
     */
    const removeGroup = useCallback((id: string) => {
        setGroups((prev) => prev.filter((g) => g.id !== id));
        // Ungroup all sessions in this group
        setSessions((prev) =>
            prev.map((s) => (s.groupId === id ? { ...s, groupId: null } : s))
        );
        if (activeGroupId === id) {
            setActiveGroupId(null);
        }
    }, [activeGroupId]);

    /**
     * Renames a tab group
     */
    const renameGroup = useCallback((id: string, name: string) => {
        setGroups((prev) =>
            prev.map((g) => (g.id === id ? { ...g, name } : g))
        );
    }, []);

    /**
     * Sets the active group filter and ensures activeSessionId is valid for the new group
     */
    const setActiveGroup = useCallback((id: string | null) => {
        console.log(`[setActiveGroup] Switching to group: ${id}`);
        setActiveGroupId(id);

        if (id === null) {
            // Switching to "All" - keep current active session
            return;
        }

        // Check if current active session is in the new group
        const currentSessions = sessionsRef.current;

        // Use a state update function to check and update activeSessionId
        setActiveSessionId(currentActiveId => {
            console.log(`[setActiveGroup] Current active session: ${currentActiveId}`);
            const activeSession = currentSessions.find(s => s.id === currentActiveId);
            console.log(`[setActiveGroup] Active session groupId: ${activeSession?.groupId}, target group: ${id}`);

            if (activeSession && activeSession.groupId === id) {
                // Active session is already in this group, keep it
                console.log(`[setActiveGroup] Keeping current session`);
                return currentActiveId;
            }

            // Active session is not in the new group - select first session from new group
            const firstInGroup = currentSessions.find(s => s.groupId === id);
            console.log(`[setActiveGroup] First in group: ${firstInGroup?.id}`);
            return firstInGroup ? firstInGroup.id : currentActiveId;
        });
    }, []);

    /**
     * Moves a session to a group
     */
    const moveToGroup = useCallback((sessionId: string, groupId: string | null) => {
        setSessions((prev) =>
            prev.map((s) => (s.id === sessionId ? { ...s, groupId } : s))
        );
    }, []);

    const value: TerminalState = {
        sessions,
        groups,
        activeSessionId,
        activeGroupId,
        layoutMode,
        addSession,
        addTelnetSession,
        removeSession,
        setActiveSession,
        toggleBroadcast,
        updateSessionName,
        setTerminal,
        setSessionId,
        broadcastKeystroke,
        toggleLayoutMode,
        addGroup,
        removeGroup,
        renameGroup,
        setActiveGroup,
        moveToGroup,
    };

    return (
        <TerminalContext.Provider value={value}>
            {children}
        </TerminalContext.Provider>
    );
}
