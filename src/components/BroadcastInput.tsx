/**
 * BroadcastInput Component
 * 
 * Provides a command input interface that broadcasts keystrokes
 * to all terminals with broadcast enabled. Supports:
 * - Real-time keystroke broadcasting (each key sent immediately)
 * - Command history navigation (arrow keys)
 * - Cisco keyword highlighting and suggestions
 * - Vim-style commands:
 *   :l or :local - broadcast to current group only
 *   :a or :all   - broadcast to all terminals
 *   :g <name>    - broadcast to specific group
 *   :m <pattern> <group> - move terminals matching pattern to group
 *   :m <pattern>  - remove terminals from group
 *   :s <group>   - switch to viewing a group (:s all for all)
 * 
 * Wildcard patterns for :m command:
 *   * matches any characters (e.g., R-* matches R-1, R-2, R-CID1)
 *   ? matches single character (e.g., R-? matches R-1, R-2 but not R-10)
 */

import { useState, useRef, useCallback, useMemo } from "react";
import { useTerminals } from "../context/TerminalContext";
import { CiscoKeywords } from "../types/terminal";

/** Broadcast target modes */
type BroadcastMode = "all" | "group" | "custom";

/**
 * Broadcast status icon
 */
function BroadcastIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
            <path d="M7.8 16.2C5.4 13.8 5.4 10.2 7.8 7.8" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <path d="M16.2 7.8C18.6 10.2 18.6 13.8 16.2 16.2" />
            <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
        </svg>
    );
}

export function BroadcastInput() {
    const [_history, setHistory] = useState<string[]>([]);
    const [currentLine, setCurrentLine] = useState("");
    const [outOfSync, setOutOfSync] = useState(false);
    const [broadcastMode, setBroadcastMode] = useState<BroadcastMode>("all");
    const [customGroupId, setCustomGroupId] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const { broadcastKeystroke, sessions, groups, activeGroupId, moveToGroup, setActiveGroup } = useTerminals();

    // Calculate which sessions will receive broadcasts based on mode
    const targetSessions = useMemo(() => {
        let filtered = sessions.filter(s => s.broadcastEnabled);

        if (broadcastMode === "group") {
            // Broadcast to current group only
            if (activeGroupId) {
                filtered = filtered.filter(s => s.groupId === activeGroupId);
            }
        } else if (broadcastMode === "custom" && customGroupId) {
            // Broadcast to specific group
            filtered = filtered.filter(s => s.groupId === customGroupId);
        }
        // "all" mode uses all enabled sessions

        return filtered;
    }, [sessions, broadcastMode, activeGroupId, customGroupId]);

    const enabledCount = targetSessions.length;
    const totalCount = sessions.length;

    // Get current group name for display
    const currentGroupName = useMemo(() => {
        if (broadcastMode === "group" && activeGroupId) {
            return groups.find(g => g.id === activeGroupId)?.name || "Current Group";
        }
        if (broadcastMode === "custom" && customGroupId) {
            return groups.find(g => g.id === customGroupId)?.name || "Unknown";
        }
        return null;
    }, [broadcastMode, activeGroupId, customGroupId, groups]);

    /**
     * Broadcast keystroke with current mode filter applied
     */
    const broadcast = useCallback((key: string) => {
        if (broadcastMode === "group" && activeGroupId) {
            broadcastKeystroke(key, activeGroupId);
        } else if (broadcastMode === "custom" && customGroupId) {
            broadcastKeystroke(key, customGroupId);
        } else {
            // "all" mode - no filter
            broadcastKeystroke(key);
        }
    }, [broadcastKeystroke, broadcastMode, activeGroupId, customGroupId]);

    /**
     * Check for vim-style commands
     */
    const checkVimCommand = useCallback((line: string): boolean => {
        const trimmed = line.trim().toLowerCase();

        // :l or :local - broadcast to current group
        if (trimmed === ":l" || trimmed === ":local") {
            if (activeGroupId) {
                setBroadcastMode("group");
                setCurrentLine("");
                return true;
            }
        }

        // :a or :all - broadcast to all
        if (trimmed === ":a" || trimmed === ":all") {
            setBroadcastMode("all");
            setCustomGroupId(null);
            setCurrentLine("");
            return true;
        }

        // :g <name> - broadcast to specific group
        if (trimmed.startsWith(":g ") || trimmed.startsWith(":group ")) {
            const groupName = line.slice(line.indexOf(" ") + 1).trim();
            const group = groups.find(g => g.name.toLowerCase() === groupName.toLowerCase());
            if (group) {
                setBroadcastMode("custom");
                setCustomGroupId(group.id);
                setCurrentLine("");
                return true;
            }
        }

        // :m <terminal> <group> - move terminal to group
        // :m <terminal> - remove terminal from group (move to ungrouped)
        // Supports wildcards: :m R-* Routers (moves all terminals starting with R-)
        if (trimmed.startsWith(":m ") || trimmed.startsWith(":move ")) {
            const args = line.slice(line.indexOf(" ") + 1).trim().split(/\s+/);
            if (args.length >= 1) {
                const terminalPattern = args[0];
                const groupName = args.slice(1).join(" ") || null;

                // Convert wildcard pattern to regex
                // * matches any characters, ? matches single character
                const regexPattern = terminalPattern
                    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
                    .replace(/\*/g, '.*')  // * -> .*
                    .replace(/\?/g, '.');  // ? -> .
                const regex = new RegExp(`^${regexPattern}$`, 'i');

                // Find all matching terminals
                const matchingSessions = sessions.filter(s => regex.test(s.name));

                if (matchingSessions.length > 0) {
                    if (groupName) {
                        // Find group and move terminals to it
                        const group = groups.find(g =>
                            g.name.toLowerCase().includes(groupName.toLowerCase())
                        );
                        if (group) {
                            matchingSessions.forEach(s => moveToGroup(s.id, group.id));
                            console.log(`[VimCmd] Moved ${matchingSessions.length} terminals to ${group.name}`);
                            setCurrentLine("");
                            return true;
                        }
                    } else {
                        // Remove from group
                        matchingSessions.forEach(s => moveToGroup(s.id, null));
                        console.log(`[VimCmd] Removed ${matchingSessions.length} terminals from groups`);
                        setCurrentLine("");
                        return true;
                    }
                }
            }
        }

        // :s <group> - switch to viewing a specific group
        if (trimmed.startsWith(":s ") || trimmed.startsWith(":switch ")) {
            const groupName = line.slice(line.indexOf(" ") + 1).trim();
            if (groupName.toLowerCase() === "all") {
                setActiveGroup(null);
                setCurrentLine("");
                return true;
            }
            const group = groups.find(g => g.name.toLowerCase().includes(groupName.toLowerCase()));
            if (group) {
                setActiveGroup(group.id);
                setCurrentLine("");
                return true;
            }
        }

        // :? or :help - show help
        if (trimmed === ":?" || trimmed === ":help") {
            // Just clear - help is shown in placeholder
            setCurrentLine("");
            return true;
        }

        return false;
    }, [activeGroupId, groups, sessions, moveToGroup, setActiveGroup]);

    /**
     * Handle keyboard events and broadcast keystrokes in real-time
     */
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        // Check for vim commands on Enter, even with 0 enabled
        if (e.key === "Enter" && currentLine.startsWith(":")) {
            e.preventDefault();
            if (checkVimCommand(currentLine)) {
                return;
            }
        }

        if (enabledCount === 0) return;

        // Prevent default for special keys we handle
        if (["Enter", "Backspace", "Delete", "Tab", "Escape"].includes(e.key) ||
            e.key.startsWith("Arrow") ||
            (e.ctrlKey && ["c", "d", "z", "l", "u", "w", "a", "e"].includes(e.key.toLowerCase()))) {
            e.preventDefault();
        }

        // Handle Enter - send carriage return and track history
        if (e.key === "Enter") {
            broadcast("\r");
            if (currentLine.trim()) {
                setHistory(prev => {
                    if (prev[prev.length - 1] === currentLine) return prev;
                    return [...prev, currentLine];
                });
            }
            setCurrentLine("");
            setOutOfSync(false); // Reset sync state on new command
            return;
        }

        // Handle Backspace
        if (e.key === "Backspace") {
            broadcast("\x7f"); // DEL character
            setCurrentLine(prev => prev.slice(0, -1));
            return;
        }

        // Handle Tab (autocomplete in Cisco)
        // Clear local input since the router will echo back the completed command
        // We can't know what the completion is without parsing router output
        if (e.key === "Tab") {
            broadcast("\t");
            // Mark as out of sync - the device has autocompleted but we don't know to what
            setOutOfSync(true);
            return;
        }

        // Handle Ctrl+C (interrupt)
        if (e.ctrlKey && e.key.toLowerCase() === "c") {
            broadcast("\x03");
            setCurrentLine("");
            setOutOfSync(false);
            return;
        }

        // Handle Ctrl+D (EOF)
        if (e.ctrlKey && e.key.toLowerCase() === "d") {
            broadcast("\x04");
            return;
        }

        // Handle Ctrl+Z (suspend)
        if (e.ctrlKey && e.key.toLowerCase() === "z") {
            broadcast("\x1a");
            return;
        }

        // Handle Ctrl+L (clear screen)
        if (e.ctrlKey && e.key.toLowerCase() === "l") {
            broadcast("\x0c");
            return;
        }

        // Handle Ctrl+U (clear line)
        if (e.ctrlKey && e.key.toLowerCase() === "u") {
            broadcast("\x15");
            setCurrentLine("");
            setOutOfSync(false);
            return;
        }

        // Handle Ctrl+W (delete word)
        if (e.ctrlKey && e.key.toLowerCase() === "w") {
            broadcast("\x17");
            setCurrentLine(prev => prev.replace(/\S+\s*$/, ""));
            return;
        }

        // Handle Ctrl+A (go to beginning)
        if (e.ctrlKey && e.key.toLowerCase() === "a") {
            broadcast("\x01");
            return;
        }

        // Handle Ctrl+E (go to end)
        if (e.ctrlKey && e.key.toLowerCase() === "e") {
            broadcast("\x05");
            return;
        }

        // Handle arrow keys (for CLI history in Cisco)
        if (e.key === "ArrowUp") {
            broadcast("\x1b[A");
            return;
        }
        if (e.key === "ArrowDown") {
            broadcast("\x1b[B");
            return;
        }
        if (e.key === "ArrowRight") {
            broadcast("\x1b[C");
            return;
        }
        if (e.key === "ArrowLeft") {
            broadcast("\x1b[D");
            return;
        }

        // Handle Escape
        if (e.key === "Escape") {
            broadcast("\x1b");
            return;
        }
    }, [enabledCount, broadcast, currentLine, checkVimCommand]);

    /**
     * Handle regular character input - skip broadcasting for vim commands
     */
    const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        const oldValue = currentLine;

        setCurrentLine(newValue);

        // Don't broadcast vim commands
        if (newValue.startsWith(":")) {
            return;
        }

        // Find what was added (simple append detection)
        if (newValue.length > oldValue.length) {
            const added = newValue.slice(oldValue.length);
            for (const char of added) {
                broadcast(char);
            }
        }
    }, [currentLine, broadcast]);

    /**
     * Highlight network keywords in the current line display
     */
    const highlightCommand = (cmd: string): React.ReactNode => {
        const words = cmd.split(/(\s+)/);
        return words.map((word, i) => {
            const lowerWord = word.toLowerCase();
            let className = "";

            if (CiscoKeywords.commands.some((k) => k.toLowerCase() === lowerWord)) {
                className = "hl-command";
            } else if (CiscoKeywords.protocols.some((k) => k.toLowerCase() === lowerWord)) {
                className = "hl-protocol";
            } else if (CiscoKeywords.interfaces.some((k) => k.toLowerCase() === lowerWord)) {
                className = "hl-interface";
            } else if (CiscoKeywords.keywords.some((k) => k.toLowerCase() === lowerWord)) {
                className = "hl-keyword";
            } else if (/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(word)) {
                className = "hl-ip";
            }

            return className ? (
                <span key={i} className={className}>{word}</span>
            ) : (
                <span key={i}>{word}</span>
            );
        });
    };

    // Get mode indicator text
    const getModeLabel = () => {
        if (broadcastMode === "group" && currentGroupName) {
            return `Group: ${currentGroupName}`;
        }
        if (broadcastMode === "custom" && currentGroupName) {
            return `Group: ${currentGroupName}`;
        }
        return "All";
    };

    const isVimCommand = currentLine.startsWith(":");

    return (
        <div className="broadcast-panel">
            <div className="broadcast-header">
                <div className="broadcast-status">
                    <BroadcastIcon />
                    <span className="broadcast-label">Broadcast</span>
                    <span className={`broadcast-mode ${broadcastMode}`} onClick={() => setBroadcastMode("all")} title="Click to reset to All">
                        {getModeLabel()}
                    </span>
                    {totalCount > 0 ? (
                        <span className="broadcast-count">
                            {enabledCount} of {totalCount}
                        </span>
                    ) : (
                        <span className="broadcast-count muted">No terminals</span>
                    )}
                </div>
                <span className="vim-commands-hint">
                    :l (group) :a (all) :g name
                </span>
            </div>

            <div className="broadcast-form">
                <div className={`command-input-wrapper ${outOfSync ? "out-of-sync" : ""} ${isVimCommand ? "vim-mode" : ""}`}>
                    <span className="command-prompt">{isVimCommand ? ":" : "$"}</span>
                    <div className="command-highlight">{isVimCommand ? currentLine.slice(1) : highlightCommand(currentLine)}</div>
                    <input
                        ref={inputRef}
                        type="text"
                        value={currentLine}
                        onChange={handleInput}
                        onKeyDown={handleKeyDown}
                        placeholder={enabledCount > 0
                            ? "Type to broadcast... (:? for commands)"
                            : "Double-click tabs to enable broadcast"}
                        className="command-input"
                        autoComplete="off"
                        spellCheck={false}
                        disabled={totalCount === 0}
                    />
                    {outOfSync && (
                        <span className="sync-indicator" title="Tab completion handled by device - input may not match terminal">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                        </span>
                    )}
                </div>
                <div className="broadcast-hint">
                    {isVimCommand ? (
                        <span className="hint-vim">Vim command mode - Enter to execute</span>
                    ) : outOfSync ? (
                        <span className="hint-warning">Tab pressed - device autocompleted</span>
                    ) : enabledCount > 0 ? (
                        <span className="hint-active">Live: keystrokes sent to {enabledCount} terminal{enabledCount !== 1 ? "s" : ""}</span>
                    ) : (
                        <span className="hint-disabled">No terminals receiving broadcast</span>
                    )}
                </div>
            </div>
        </div>
    );
}