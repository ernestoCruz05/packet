/**
 * Keyboard Shortcuts Hook
 * 
 * Provides global keyboard shortcuts for terminal management:
 * - Ctrl+T: New local terminal
 * - Ctrl+Shift+T: Open telnet connect dialog
 * - Ctrl+W: Close current terminal
 * - Ctrl+Tab: Next terminal
 * - Ctrl+Shift+Tab: Previous terminal
 * - Ctrl+G: Toggle grid/tabs view
 * - Ctrl+B: Toggle broadcast on current terminal
 * - Ctrl+1-9: Switch to terminal by number
 */

import { useEffect, useCallback } from "react";
import { useTerminals } from "../context/TerminalContext";

interface KeyboardShortcutsOptions {
    onOpenConnectDialog?: () => void;
    onToggleSearch?: () => void;
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
    const {
        sessions,
        activeSessionId,
        addSession,
        removeSession,
        setActiveSession,
        toggleBroadcast,
        toggleLayoutMode,
    } = useTerminals();

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Don't trigger shortcuts when typing in input fields (except terminal)
        const target = e.target as HTMLElement;
        const isInputField = target.tagName === "INPUT" || target.tagName === "TEXTAREA";

        // Allow some shortcuts even in input fields
        const allowInInput = ["Tab"].includes(e.key);

        if (isInputField && !allowInInput && !e.ctrlKey) {
            return;
        }

        // Ctrl+T: New terminal
        if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "t") {
            e.preventDefault();
            addSession();
            return;
        }

        // Ctrl+Shift+T: Open telnet connect dialog
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "t") {
            e.preventDefault();
            options.onOpenConnectDialog?.();
            return;
        }

        // Ctrl+W: Close current terminal
        if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "w") {
            e.preventDefault();
            if (activeSessionId) {
                removeSession(activeSessionId);
            }
            return;
        }

        // Ctrl+Tab / Ctrl+Shift+Tab: Switch terminals
        if (e.ctrlKey && e.key === "Tab") {
            e.preventDefault();
            if (sessions.length === 0) return;

            const currentIndex = sessions.findIndex(s => s.id === activeSessionId);
            let newIndex: number;

            if (e.shiftKey) {
                // Previous terminal
                newIndex = currentIndex <= 0 ? sessions.length - 1 : currentIndex - 1;
            } else {
                // Next terminal
                newIndex = currentIndex >= sessions.length - 1 ? 0 : currentIndex + 1;
            }

            setActiveSession(sessions[newIndex].id);
            return;
        }

        // Ctrl+G: Toggle grid view
        if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "g") {
            e.preventDefault();
            toggleLayoutMode();
            return;
        }

        // Ctrl+B: Toggle broadcast on current terminal
        if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "b") {
            e.preventDefault();
            if (activeSessionId) {
                toggleBroadcast(activeSessionId);
            }
            return;
        }

        // Ctrl+Shift+F: Toggle search
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "f") {
            e.preventDefault();
            options.onToggleSearch?.();
            return;
        }

        // Ctrl+1-9: Switch to terminal by number
        if (e.ctrlKey && !e.shiftKey && e.key >= "1" && e.key <= "9") {
            e.preventDefault();
            const index = parseInt(e.key) - 1;
            if (index < sessions.length) {
                setActiveSession(sessions[index].id);
            }
            return;
        }
    }, [sessions, activeSessionId, addSession, removeSession, setActiveSession, toggleBroadcast, toggleLayoutMode, options]);

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);
}
