/**
 * ConnectDialog Component
 * 
 * Modal dialog for connecting to GNS3 devices via telnet.
 * Allows entering host, port, and optional device name.
 */

import { useState, useRef, useEffect } from "react";
import { useTerminals } from "../context/TerminalContext";

interface ConnectDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Network icon for dialog header
 */
function NetworkIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="6" height="6" rx="1" />
            <rect x="16" y="2" width="6" height="6" rx="1" />
            <rect x="9" y="16" width="6" height="6" rx="1" />
            <path d="M5 8v3a2 2 0 002 2h10a2 2 0 002-2V8" />
            <path d="M12 13v3" />
        </svg>
    );
}

export function ConnectDialog({ isOpen, onClose }: ConnectDialogProps) {
    const { addTelnetSession } = useTerminals();
    const [host, setHost] = useState("localhost");
    const [port, setPort] = useState("");
    const [deviceName, setDeviceName] = useState("");
    const [error, setError] = useState("");
    const portInputRef = useRef<HTMLInputElement>(null);

    // Focus port input when dialog opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => portInputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Handle escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) {
                onClose();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        // Validate port
        const portNum = parseInt(port, 10);
        if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
            setError("Please enter a valid port number (1-65535)");
            return;
        }

        // Validate host
        if (!host.trim()) {
            setError("Please enter a host address");
            return;
        }

        // Create the telnet session
        addTelnetSession(host.trim(), portNum, deviceName.trim() || undefined);

        // Reset form and close
        setPort("");
        setDeviceName("");
        setError("");
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="dialog-overlay" onClick={onClose}>
            <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
                <div className="dialog-header">
                    <NetworkIcon />
                    <h2>Connect to Device</h2>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="dialog-body">
                        <p className="dialog-description">
                            Connect to a GNS3 router or switch console via telnet.
                        </p>

                        <div className="form-group">
                            <label htmlFor="host">Host</label>
                            <input
                                id="host"
                                type="text"
                                value={host}
                                onChange={(e) => setHost(e.target.value)}
                                placeholder="localhost"
                                autoComplete="off"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="port">Port *</label>
                            <input
                                ref={portInputRef}
                                id="port"
                                type="number"
                                value={port}
                                onChange={(e) => setPort(e.target.value)}
                                placeholder="5000"
                                min="1"
                                max="65535"
                                required
                                autoComplete="off"
                            />
                            <span className="form-hint">
                                Find the console port in GNS3 (right-click device → Show console port)
                            </span>
                        </div>

                        <div className="form-group">
                            <label htmlFor="deviceName">Device Name (optional)</label>
                            <input
                                id="deviceName"
                                type="text"
                                value={deviceName}
                                onChange={(e) => setDeviceName(e.target.value)}
                                placeholder="R1, SW1, etc."
                                autoComplete="off"
                            />
                        </div>

                        {error && (
                            <div className="form-error">{error}</div>
                        )}
                    </div>

                    <div className="dialog-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            Connect
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
