/**
 * TerminalGrid Component
 * 
 * Provides a tabbed interface for managing multiple terminal sessions.
 * Supports both local terminals and telnet connections to GNS3 devices.
 * Each tab shows connection type, broadcast status, and controls.
 * Includes tab groups for organizing terminals.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useTerminals } from "../context/TerminalContext";
import { TerminalPanel, getSearchAddon } from "./TerminalPanel";
import { ConnectDialog } from "./ConnectDialog";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useResizableGrid } from "../hooks/useResizableGrid";

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
 * Grid view icon
 */
function GridIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
        </svg>
    );
}

/**
 * Tabs view icon
 */
function TabsIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 3v6" />
        </svg>
    );
}

/**
 * Search icon
 */
function SearchIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
        </svg>
    );
}

/**
 * Folder/Group icon
 */
function FolderIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
    );
}

/**
 * Connection type indicator for tabs
 */
function ConnectionTypeIndicator({ type, enabled }: { type: "local" | "telnet" | "ssh"; enabled: boolean }) {
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
    if (type === "ssh") {
        return (
            <span className={`tab-type-indicator ssh ${enabled ? "broadcast" : ""}`} title="SSH connection">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
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
    const {
        sessions,
        groups,
        activeSessionId,
        activeGroupId,
        layoutMode,
        addSession,
        setActiveSession,
        removeSession,
        toggleBroadcast,
        updateSessionName,
        toggleLayoutMode,
        addGroup,
        removeGroup,
        renameGroup,
        setActiveGroup,
        reorderSessions,
    } = useTerminals();
    const [isConnectDialogOpen, setConnectDialogOpen] = useState(false);
    const [isGroupMenuOpen, setGroupMenuOpen] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

    // Drag and drop state
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    // Search state
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Enable keyboard shortcuts
    const openConnectDialog = useCallback(() => setConnectDialogOpen(true), []);
    const toggleSearch = useCallback(() => {
        setIsSearchOpen(prev => !prev);
        if (!isSearchOpen) {
            setTimeout(() => searchInputRef.current?.focus(), 50);
        }
    }, [isSearchOpen]);
    useKeyboardShortcuts({ onOpenConnectDialog: openConnectDialog, onToggleSearch: toggleSearch });

    // Filter sessions by active group
    const filteredSessions = useMemo(() => {
        if (activeGroupId === null) return sessions;
        return sessions.filter(s => s.groupId === activeGroupId);
    }, [sessions, activeGroupId]);

    // Resizable grid for grid view mode
    const { containerRef, gridSize, getGridStyle, incrementCols, decrementCols } = useResizableGrid(
        filteredSessions.length
    );

    const handleAddSession = useCallback(() => {
        addSession();
    }, [addSession]);

    const handleTabClose = (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        removeSession(sessionId);
    };

    // Search handlers
    const handleSearch = useCallback((direction: "next" | "prev" = "next") => {
        if (!activeSessionId || !searchQuery) return;
        const searchAddon = getSearchAddon(activeSessionId);
        if (searchAddon) {
            const options = { caseSensitive: false, wholeWord: false, regex: false };
            if (direction === "next") {
                searchAddon.findNext(searchQuery, options);
            } else {
                searchAddon.findPrevious(searchQuery, options);
            }
        }
    }, [activeSessionId, searchQuery]);

    const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleSearch(e.shiftKey ? "prev" : "next");
        } else if (e.key === "Escape") {
            setIsSearchOpen(false);
            setSearchQuery("");
            // Clear search highlighting
            if (activeSessionId) {
                const searchAddon = getSearchAddon(activeSessionId);
                searchAddon?.clearDecorations();
            }
        }
    }, [handleSearch, activeSessionId]);

    // Trigger search when query changes
    useEffect(() => {
        if (searchQuery && activeSessionId) {
            handleSearch("next");
        }
    }, [searchQuery]);

    // Drag and drop handlers
    const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", index.toString());
        // Add a slight delay to show the dragging state
        setTimeout(() => {
            (e.target as HTMLElement).classList.add("dragging");
        }, 0);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOverIndex(index);
    }, []);

    const handleDragEnd = useCallback((e: React.DragEvent) => {
        (e.target as HTMLElement).classList.remove("dragging");
        setDraggedIndex(null);
        setDragOverIndex(null);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
        e.preventDefault();
        const fromIndex = draggedIndex;
        if (fromIndex !== null && fromIndex !== toIndex) {
            reorderSessions(fromIndex, toIndex);
        }
        setDraggedIndex(null);
        setDragOverIndex(null);
    }, [draggedIndex, reorderSessions]);

    const handleTabDoubleClick = (_e: React.MouseEvent, sessionId: string) => {
        toggleBroadcast(sessionId);
    };

    const handleCreateGroup = () => {
        if (newGroupName.trim()) {
            addGroup(newGroupName.trim());
            setNewGroupName("");
            setGroupMenuOpen(false);
        }
    };

    const handleGroupKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleCreateGroup();
        } else if (e.key === "Escape") {
            setGroupMenuOpen(false);
        }
    };

    const getGroupForSession = (sessionGroupId: string | null) => {
        if (!sessionGroupId) return null;
        return groups.find(g => g.id === sessionGroupId);
    };

    const activeGroup = activeGroupId ? groups.find(g => g.id === activeGroupId) : null;

    return (
        <div className="terminal-tabs-container">
            {/* Tab Bar */}
            <div className="terminal-tabs-bar">
                {/* Group Dropdown - show if groups exist OR menu is open */}
                {(groups.length > 0 || isGroupMenuOpen) && (
                    <div className="group-dropdown-container">
                        <button
                            className="group-dropdown-btn"
                            onClick={() => setGroupMenuOpen(!isGroupMenuOpen)}
                        >
                            {activeGroup ? (
                                <>
                                    <span className="group-color" style={{ backgroundColor: activeGroup.color }} />
                                    <span>{activeGroup.name}</span>
                                </>
                            ) : (
                                <span>All</span>
                            )}
                        </button>
                        {isGroupMenuOpen && (
                            <>
                                <div className="group-dropdown-overlay" onClick={() => setGroupMenuOpen(false)} />
                                <div className="group-dropdown-menu">
                                    <button
                                        className={`group-dropdown-item ${activeGroupId === null ? "active" : ""}`}
                                        onClick={() => { setActiveGroup(null); setGroupMenuOpen(false); }}
                                    >
                                        All ({sessions.length})
                                    </button>
                                    {groups.map((group) => {
                                        const count = sessions.filter(s => s.groupId === group.id).length;
                                        return (
                                            <div key={group.id} className="group-dropdown-item-wrapper">
                                                <button
                                                    className={`group-dropdown-item ${activeGroupId === group.id ? "active" : ""}`}
                                                    onClick={() => { setActiveGroup(group.id); setGroupMenuOpen(false); }}
                                                >
                                                    <span className="group-color" style={{ backgroundColor: group.color }} />
                                                    {editingGroupId === group.id ? (
                                                        <input
                                                            type="text"
                                                            className="group-name-input"
                                                            defaultValue={group.name}
                                                            autoFocus
                                                            onClick={(e) => e.stopPropagation()}
                                                            onBlur={(e) => {
                                                                renameGroup(group.id, e.target.value || group.name);
                                                                setEditingGroupId(null);
                                                            }}
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter") {
                                                                    renameGroup(group.id, e.currentTarget.value || group.name);
                                                                    setEditingGroupId(null);
                                                                } else if (e.key === "Escape") {
                                                                    setEditingGroupId(null);
                                                                }
                                                            }}
                                                        />
                                                    ) : (
                                                        <span onDoubleClick={(e) => { e.stopPropagation(); setEditingGroupId(group.id); }}>
                                                            {group.name} ({count})
                                                        </span>
                                                    )}
                                                </button>
                                                <button
                                                    className="group-delete-btn"
                                                    onClick={(e) => { e.stopPropagation(); removeGroup(group.id); }}
                                                    title="Delete group"
                                                >
                                                    <CloseIcon />
                                                </button>
                                            </div>
                                        );
                                    })}
                                    <div className="group-dropdown-divider" />
                                    <div className="group-dropdown-new">
                                        <input
                                            type="text"
                                            placeholder="New group..."
                                            value={newGroupName}
                                            onChange={(e) => setNewGroupName(e.target.value)}
                                            onKeyDown={handleGroupKeyDown}
                                        />
                                        <button onClick={handleCreateGroup} disabled={!newGroupName.trim()}>
                                            <PlusIcon />
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                <div className="terminal-tabs">
                    {filteredSessions.map((session) => {
                        const group = getGroupForSession(session.groupId);
                        const globalIndex = sessions.findIndex(s => s.id === session.id);
                        return (
                            <div
                                key={session.id}
                                className={`terminal-tab ${session.id === activeSessionId ? "active" : ""} ${session.broadcastEnabled ? "broadcast-enabled" : ""} ${session.connectionType} ${dragOverIndex === globalIndex ? "drag-over" : ""}`}
                                onClick={() => setActiveSession(session.id)}
                                onDoubleClick={(e) => handleTabDoubleClick(e, session.id)}
                                draggable
                                onDragStart={(e) => handleDragStart(e, globalIndex)}
                                onDragOver={(e) => handleDragOver(e, globalIndex)}
                                onDragEnd={handleDragEnd}
                                onDrop={(e) => handleDrop(e, globalIndex)}
                                title={`${session.name} (${session.connectionType})${session.broadcastEnabled ? " - Broadcast ON" : " - Broadcast OFF"}${group ? ` [${group.name}]` : ""}\nDouble-click to toggle broadcast\nDrag to reorder`}
                                style={group ? { borderTopColor: group.color } : undefined}
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
                        );
                    })}
                </div>
                <div className="tab-actions">
                    {activeSessionId && (
                        <button
                            className={`tab-action-btn ${isSearchOpen ? "active" : ""}`}
                            onClick={toggleSearch}
                            title="Search in Terminal (Ctrl+Shift+F)"
                        >
                            <SearchIcon />
                        </button>
                    )}
                    <button
                        className="tab-action-btn"
                        onClick={() => setGroupMenuOpen(true)}
                        title="Manage groups"
                    >
                        <FolderIcon />
                        <span>{groups.length === 0 ? "New Group" : "Groups"}</span>
                    </button>
                    {filteredSessions.length > 1 && (
                        <button
                            className={`tab-action-btn ${layoutMode === "grid" ? "active" : ""}`}
                            onClick={toggleLayoutMode}
                            title={layoutMode === "tabs" ? "Switch to Grid View (Ctrl+G)" : "Switch to Tab View (Ctrl+G)"}
                        >
                            {layoutMode === "tabs" ? <GridIcon /> : <TabsIcon />}
                            <span>{layoutMode === "tabs" ? "Grid" : "Tabs"}</span>
                        </button>
                    )}
                    <button
                        className="tab-action-btn"
                        onClick={() => setConnectDialogOpen(true)}
                        title="Connect to GNS3 Device (Ctrl+Shift+T)"
                    >
                        <ConnectIcon />
                        <span>Connect</span>
                    </button>
                    <button
                        className="tab-action-btn"
                        onClick={handleAddSession}
                        title="New Local Terminal (Ctrl+T)"
                    >
                        <PlusIcon />
                        <span>Terminal</span>
                    </button>
                </div>
            </div>

            {/* Search Bar */}
            {isSearchOpen && (
                <div className="terminal-search-bar">
                    <SearchIcon />
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search in terminal..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        autoFocus
                    />
                    <button
                        className="search-nav-btn"
                        onClick={() => handleSearch("prev")}
                        title="Previous match (Shift+Enter)"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 15l-6-6-6 6" />
                        </svg>
                    </button>
                    <button
                        className="search-nav-btn"
                        onClick={() => handleSearch("next")}
                        title="Next match (Enter)"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </button>
                    <button
                        className="search-close-btn"
                        onClick={() => {
                            setIsSearchOpen(false);
                            setSearchQuery("");
                            if (activeSessionId) {
                                const searchAddon = getSearchAddon(activeSessionId);
                                searchAddon?.clearDecorations();
                            }
                        }}
                        title="Close (Escape)"
                    >
                        <CloseIcon />
                    </button>
                </div>
            )}

            {/* Terminal Content Area */}
            <div className={`terminal-content ${layoutMode === "grid" ? "grid-mode" : ""}`}>
                {filteredSessions.length === 0 ? (
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
                            <button className="btn btn-secondary btn-lg" onClick={handleAddSession}>
                                <PlusIcon />
                                <span>Local Terminal</span>
                            </button>
                        </div>
                    </div>
                ) : layoutMode === "grid" ? (
                    // Grid Mode - show all terminals in a responsive grid
                    <>
                        <div className="grid-controls">
                            <button
                                className="grid-control-btn"
                                onClick={decrementCols}
                                disabled={gridSize.cols <= 1}
                                title="Fewer columns"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                            </button>
                            <span className="grid-control-label">{gridSize.cols} × {gridSize.rows}</span>
                            <button
                                className="grid-control-btn"
                                onClick={incrementCols}
                                disabled={gridSize.cols >= filteredSessions.length}
                                title="More columns"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                            </button>
                        </div>
                        <div className="terminal-grid" ref={containerRef} style={getGridStyle()}>
                            {/* Render ALL sessions to prevent unmounting, hide non-group ones */}
                            {sessions.map((session) => {
                                const isInGroup = activeGroupId === null || session.groupId === activeGroupId;
                                return (
                                    <div
                                        key={session.id}
                                        className={`terminal-grid-item ${session.id === activeSessionId ? "active" : ""} ${session.broadcastEnabled ? "broadcast-enabled" : ""} ${!isInGroup ? "hidden-group" : ""}`}
                                        onClick={() => setActiveSession(session.id)}
                                    >
                                        <div className="grid-item-header">
                                            <span className="grid-item-name">{session.name}</span>
                                            <ConnectionTypeIndicator type={session.connectionType} enabled={session.broadcastEnabled} />
                                        </div>
                                        <div className="grid-item-terminal">
                                            <TerminalPanel session={session} isActive={isInGroup} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    // Tabs Mode - render ALL sessions, CSS handles visibility
                    // Using visibility:hidden instead of display:none prevents xterm corruption
                    sessions.map((session) => {
                        const isVisible = (activeGroupId === null || session.groupId === activeGroupId)
                            && session.id === activeSessionId;
                        return (
                            <div
                                key={session.id}
                                className={`terminal-pane ${isVisible ? "active" : ""}`}
                            >
                                <TerminalPanel session={session} isActive={isVisible} />
                            </div>
                        );
                    })
                )}
            </div>

            {/* Connect Dialog */}
            <ConnectDialog isOpen={isConnectDialogOpen} onClose={() => setConnectDialogOpen(false)} />
        </div>
    );
}