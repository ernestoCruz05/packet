/**
 * TerminalTabs Component
 * 
 * Provides a tabbed interface for managing multiple terminal sessions.
 * Supports both local terminals and telnet connections to GNS3 devices.
 * Each tab shows connection type, broadcast status, and controls.
 */

import { useState } from "react";
import { useTerminals } from "../context/TerminalContext";
import { TerminalPanel } from "./TerminalPanel";
import { ConnectDialog } from "./ConnectDialog";

/**
 * Icon component for adding new terminals
 */
function PlusIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    );
}

/**
 * Network connect icon
 */
function ConnectIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14" />
            <path d="M12 5l7 7-7 7" />
        </svg>
    );
}

/**
 * Close icon for tabs
 */
function CloseIcon() {
    return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    );
}

/**
 * Connection type indicator for tabs
 */
function ConnectionTypeIndicator({ type, enabled }: { type: "local" | "telnet"; enabled: boolean }) {
    if (type === "telnet") {
        return (
            <span className={`tab-type-indicator telnet ${enabled ? "broadcast" : ""}`} title="Telnet connection">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" />
                    <path d="M12 2a15.3 15.3 0 0 0-4 10 15.3 15.3 0 0 0 4 10" />
                    <path d="M2 12h20" />
                </svg>
            </span>
        );
    }
    return (
        <span className={`tab-type-indicator local ${enabled ? "broadcast" : ""}`} title="Local terminal">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M4 17l6-6-6-6" />
                <path d="M12 19h8" />
            </svg>
        </span>
    );
}

/**
 * Icon component for empty state
 */
function TerminalIcon() {
    return (
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M6 9L10 12L6 15" />
            <line x1="12" y1="15" x2="18" y2="15" />
        </svg>
    );
}

/**
 * Network icon for empty state
 */
function NetworkIcon() {
    return (
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
            <rect x="2" y="2" width="6" height="6" rx="1" />
            <rect x="16" y="2" width="6" height="6" rx="1" />
            <rect x="9" y="16" width="6" height="6" rx="1" />
            <path d="M5 8v3a2 2 0 002 2h10a2 2 0 002-2V8" />
            <path d="M12 13v3" />
        </svg>
    );
}

export function TerminalGrid() {
    const { sessions, activeSessionId, addSession, setActiveSession, removeSession, toggleBroadcast, updateSessionName } = useTerminals();
    const [isConnectDialogOpen, setConnectDialogOpen] = useState(false);

    const handleTabClose = (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        removeSession(sessionId);
    };

    const handleTabDoubleClick = (_e: React.MouseEvent, sessionId: string) => {
        toggleBroadcast(sessionId);
    };

    return (
        <div className="terminal-tabs-container">
            {/* Tab Bar */}
            <div className="terminal-tabs-bar">
                <div className="terminal-tabs">
                    {sessions.map((session) => (
                        <div
                            key={session.id}
                            className={`terminal-tab ${session.id === activeSessionId ? "active" : ""} ${session.broadcastEnabled ? "broadcast-enabled" : ""} ${session.connectionType}`}
                            onClick={() => setActiveSession(session.id)}
                            onDoubleClick={(e) => handleTabDoubleClick(e, session.id)}
                            title={`${session.name} (${session.connectionType})${session.broadcastEnabled ? " - Broadcast ON" : " - Broadcast OFF"}\nDouble-click to toggle broadcast`}
                        >
                            <ConnectionTypeIndicator type={session.connectionType} enabled={session.broadcastEnabled} />
                            <input
                                type="text"
                                className="tab-name"
                                value={session.name}
                                onChange={(e) => updateSessionName(session.id, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                spellCheck={false}
                            />
                            <button
                                className="tab-close"
                                onClick={(e) => handleTabClose(e, session.id)}
                                title="Close"
                            >
                                <CloseIcon />
                            </button>
                        </div>
                    ))}
                </div>
                <div className="tab-actions">
                    <button
                        className="tab-action-btn"
                        onClick={() => setConnectDialogOpen(true)}
                        title="Connect to GNS3 Device (Telnet)"
                    >
                        <ConnectIcon />
                        <span>Connect</span>
                    </button>
                    <button
                        className="tab-action-btn"
                        onClick={addSession}
                        title="New Local Terminal"
                    >
                        <PlusIcon />
                        <span>Terminal</span>
                    </button>
                </div>
            </div>

            {/* Terminal Content Area */}
            <div className="terminal-content">
                {sessions.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icons">
                            <NetworkIcon />
                            <TerminalIcon />
                        </div>
                        <h3>Packet - GNS3 Terminal Broadcaster</h3>
                        <p>Connect to network devices or open local terminals</p>
                        <div className="empty-state-actions">
                            <button className="btn btn-primary btn-lg" onClick={() => setConnectDialogOpen(true)}>
                                <ConnectIcon />
                                <span>Connect to Device</span>
                            </button>
                            <button className="btn btn-secondary btn-lg" onClick={addSession}>
                                <PlusIcon />
                                <span>Local Terminal</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    sessions.map((session) => (
                        <div
                            key={session.id}
                            className={`terminal-pane ${session.id === activeSessionId ? "active" : ""}`}
                        >
                            <TerminalPanel session={session} isActive={session.id === activeSessionId} />
                        </div>
                    ))
                )}
            </div>

            {/* Connect Dialog */}
            <ConnectDialog isOpen={isConnectDialogOpen} onClose={() => setConnectDialogOpen(false)} />
        </div>
    );
}
