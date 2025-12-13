/**
 * BroadcastInput Component
 * 
 * Provides a command input interface that broadcasts keystrokes
 * to all terminals with broadcast enabled. Supports:
 * - Real-time keystroke broadcasting (each key sent immediately)
 * - Command history navigation (arrow keys)
 * - Cisco keyword highlighting and suggestions
 */

import { useState, useRef, useCallback } from "react";
import { useTerminals } from "../context/TerminalContext";
import { CiscoKeywords } from "../types/terminal";

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
    const [history, setHistory] = useState<string[]>([]);
    const [currentLine, setCurrentLine] = useState("");
    const [outOfSync, setOutOfSync] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const { broadcastKeystroke, sessions } = useTerminals();

    const enabledCount = sessions.filter((s) => s.broadcastEnabled).length;
    const totalCount = sessions.length;

    /**
     * Handle keyboard events and broadcast keystrokes in real-time
     */
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (enabledCount === 0) return;

        // Prevent default for special keys we handle
        if (["Enter", "Backspace", "Delete", "Tab", "Escape"].includes(e.key) ||
            e.key.startsWith("Arrow") ||
            (e.ctrlKey && ["c", "d", "z", "l", "u", "w", "a", "e"].includes(e.key.toLowerCase()))) {
            e.preventDefault();
        }

        // Handle Enter - send carriage return and track history
        if (e.key === "Enter") {
            broadcastKeystroke("\r");
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
            broadcastKeystroke("\x7f"); // DEL character
            setCurrentLine(prev => prev.slice(0, -1));
            return;
        }

        // Handle Tab (autocomplete in Cisco)
        // Clear local input since the router will echo back the completed command
        // We can't know what the completion is without parsing router output
        if (e.key === "Tab") {
            broadcastKeystroke("\t");
            // Mark as out of sync - the device has autocompleted but we don't know to what
            setOutOfSync(true);
            return;
        }

        // Handle Ctrl+C (interrupt)
        if (e.ctrlKey && e.key.toLowerCase() === "c") {
            broadcastKeystroke("\x03");
            setCurrentLine("");
            setOutOfSync(false);
            return;
        }

        // Handle Ctrl+D (EOF)
        if (e.ctrlKey && e.key.toLowerCase() === "d") {
            broadcastKeystroke("\x04");
            return;
        }

        // Handle Ctrl+Z (suspend)
        if (e.ctrlKey && e.key.toLowerCase() === "z") {
            broadcastKeystroke("\x1a");
            return;
        }

        // Handle Ctrl+L (clear screen)
        if (e.ctrlKey && e.key.toLowerCase() === "l") {
            broadcastKeystroke("\x0c");
            return;
        }

        // Handle Ctrl+U (clear line)
        if (e.ctrlKey && e.key.toLowerCase() === "u") {
            broadcastKeystroke("\x15");
            setCurrentLine("");
            setOutOfSync(false);
            return;
        }

        // Handle Ctrl+W (delete word)
        if (e.ctrlKey && e.key.toLowerCase() === "w") {
            broadcastKeystroke("\x17");
            setCurrentLine(prev => prev.replace(/\S+\s*$/, ""));
            return;
        }

        // Handle Ctrl+A (go to beginning)
        if (e.ctrlKey && e.key.toLowerCase() === "a") {
            broadcastKeystroke("\x01");
            return;
        }

        // Handle Ctrl+E (go to end)
        if (e.ctrlKey && e.key.toLowerCase() === "e") {
            broadcastKeystroke("\x05");
            return;
        }

        // Handle arrow keys (for CLI history in Cisco)
        if (e.key === "ArrowUp") {
            broadcastKeystroke("\x1b[A");
            return;
        }
        if (e.key === "ArrowDown") {
            broadcastKeystroke("\x1b[B");
            return;
        }
        if (e.key === "ArrowRight") {
            broadcastKeystroke("\x1b[C");
            return;
        }
        if (e.key === "ArrowLeft") {
            broadcastKeystroke("\x1b[D");
            return;
        }

        // Handle Escape
        if (e.key === "Escape") {
            broadcastKeystroke("\x1b");
            return;
        }
    }, [enabledCount, broadcastKeystroke, currentLine]);

    /**
     * Handle regular character input
     */
    const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        const oldValue = currentLine;

        // Find what was added (simple append detection)
        if (newValue.length > oldValue.length) {
            const added = newValue.slice(oldValue.length);
            for (const char of added) {
                broadcastKeystroke(char);
            }
        }

        setCurrentLine(newValue);
    }, [currentLine, broadcastKeystroke]);

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

    return (
        <div className="broadcast-panel">
            <div className="broadcast-header">
                <div className="broadcast-status">
                    <BroadcastIcon />
                    <span className="broadcast-label">Broadcast</span>
                    {totalCount > 0 ? (
                        <span className="broadcast-count">
                            {enabledCount} of {totalCount} terminal{totalCount !== 1 ? "s" : ""}
                        </span>
                    ) : (
                        <span className="broadcast-count muted">No active terminals</span>
                    )}
                </div>
                {history.length > 0 && (
                    <span className="history-indicator">
                        {history.length} command{history.length !== 1 ? "s" : ""} in history
                    </span>
                )}
            </div>

            <div className="broadcast-form">
                <div className={`command-input-wrapper ${outOfSync ? "out-of-sync" : ""}`}>
                    <span className="command-prompt">$</span>
                    <div className="command-highlight">{highlightCommand(currentLine)}</div>
                    <input
                        ref={inputRef}
                        type="text"
                        value={currentLine}
                        onChange={handleInput}
                        onKeyDown={handleKeyDown}
                        placeholder={enabledCount > 0
                            ? "Type to broadcast keystrokes..."
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
                    {outOfSync ? (
                        <span className="hint-warning">Tab pressed - device autocompleted, local input may differ</span>
                    ) : enabledCount > 0 ? (
                        <span className="hint-active">Live mode - keystrokes sent immediately</span>
                    ) : (
                        <span className="hint-disabled">No terminals receiving broadcast</span>
                    )}
                </div>
            </div>
        </div>
    );
}
