/**
 * ConnectDialog Component
 * 
 * Modal dialog for connecting to network devices via Telnet or SSH.
 * Supports:
 * - Saved connection profiles for quick access
 * - Telnet connections (for GNS3/EVE-NG devices)
 * - SSH connections with password or public key authentication
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTerminals } from "../context/TerminalContext";
import { SshAuthType, ConnectionProfile } from "../types/terminal";

interface ConnectDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

type ConnectionMode = "telnet" | "ssh";
type DialogView = "connect" | "save-profile";

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

/**
 * SSH key icon
 */
function KeyIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
        </svg>
    );
}

/**
 * Save/bookmark icon
 */
function SaveIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
    );
}

/**
 * Delete/trash icon
 */
function DeleteIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
    );
}

export function ConnectDialog({ isOpen, onClose }: ConnectDialogProps) {
    const { addTelnetSession, addSshSession } = useTerminals();
    
    // Profiles state
    const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
    const [view, setView] = useState<DialogView>("connect");
    const [profileName, setProfileName] = useState("");
    
    // Connection mode (telnet or ssh)
    const [mode, setMode] = useState<ConnectionMode>("telnet");
    
    // Common fields
    const [host, setHost] = useState("localhost");
    const [port, setPort] = useState("");
    const [deviceName, setDeviceName] = useState("");
    const [error, setError] = useState("");
    
    // SSH-specific fields
    const [username, setUsername] = useState("");
    const [authType, setAuthType] = useState<SshAuthType>("password");
    const [password, setPassword] = useState("");
    const [keyPath, setKeyPath] = useState("~/.ssh/id_rsa");
    const [passphrase, setPassphrase] = useState("");
    
    const hostInputRef = useRef<HTMLInputElement>(null);

    // Load profiles when dialog opens
    const loadProfiles = useCallback(async () => {
        try {
            const list = await invoke<ConnectionProfile[]>("list_profiles");
            setProfiles(list);
        } catch (err) {
            console.error("Failed to load profiles:", err);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadProfiles();
            setTimeout(() => hostInputRef.current?.focus(), 100);
            // Reset default port based on mode
            if (mode === "telnet") {
                setPort("");
            } else {
                setPort("22");
            }
        }
    }, [isOpen, mode, loadProfiles]);

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

    // Update default port when mode changes
    const handleModeChange = (newMode: ConnectionMode) => {
        setMode(newMode);
        setError("");
        setSelectedProfileId(null);
        if (newMode === "ssh" && (!port || port === "5000")) {
            setPort("22");
        } else if (newMode === "telnet" && port === "22") {
            setPort("");
        }
    };

    // Load a profile into the form
    const loadProfile = (profile: ConnectionProfile) => {
        setSelectedProfileId(profile.id);
        setMode(profile.connection_type as ConnectionMode);
        setHost(profile.host);
        setPort(profile.port.toString());
        setDeviceName(profile.name);
        setUsername(profile.username || "");
        setAuthType((profile.auth_method as SshAuthType) || "password");
        setKeyPath(profile.key_path || "~/.ssh/id_rsa");
        // Password is never stored - user must enter it
        setPassword("");
        setPassphrase("");
        setError("");
    };

    // Save current form as a profile
    const saveProfile = async () => {
        if (!profileName.trim()) {
            setError("Please enter a profile name");
            return;
        }

        const portNum = parseInt(port, 10);
        if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
            setError("Please enter a valid port number");
            return;
        }

        try {
            if (selectedProfileId) {
                // Update existing profile
                await invoke("update_profile", {
                    id: selectedProfileId,
                    name: profileName.trim(),
                    connectionType: mode,
                    host: host.trim(),
                    port: portNum,
                    username: mode === "ssh" ? username.trim() : null,
                    authMethod: mode === "ssh" ? authType : null,
                    keyPath: mode === "ssh" && authType === "publickey" ? keyPath.trim() : null,
                });
            } else {
                // Create new profile
                await invoke("create_profile", {
                    name: profileName.trim(),
                    connectionType: mode,
                    host: host.trim(),
                    port: portNum,
                    username: mode === "ssh" ? username.trim() : null,
                    authMethod: mode === "ssh" ? authType : null,
                    keyPath: mode === "ssh" && authType === "publickey" ? keyPath.trim() : null,
                });
            }
            
            await loadProfiles();
            setView("connect");
            setProfileName("");
            setError("");
        } catch (err) {
            setError(`Failed to save profile: ${err}`);
        }
    };

    // Delete a profile
    const deleteProfile = async (id: string) => {
        try {
            await invoke("delete_profile", { id });
            await loadProfiles();
            if (selectedProfileId === id) {
                setSelectedProfileId(null);
                resetForm();
            }
        } catch (err) {
            console.error("Failed to delete profile:", err);
        }
    };

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

        if (mode === "telnet") {
            // Create telnet session
            addTelnetSession(host.trim(), portNum, deviceName.trim() || undefined);
        } else {
            // Validate SSH-specific fields
            if (!username.trim()) {
                setError("Please enter a username");
                return;
            }

            if (authType === "password" && !password) {
                setError("Please enter a password");
                return;
            }

            if (authType === "publickey" && !keyPath.trim()) {
                setError("Please enter the path to your private key");
                return;
            }

            // Create SSH session
            addSshSession({
                host: host.trim(),
                port: portNum,
                username: username.trim(),
                authType,
                password: authType === "password" ? password : undefined,
                keyPath: authType === "publickey" ? keyPath.trim() : undefined,
                passphrase: authType === "publickey" && passphrase ? passphrase : undefined,
            }, deviceName.trim() || undefined);
        }

        // Reset form and close
        resetForm();
        onClose();
    };

    const resetForm = () => {
        setHost("localhost");
        setPort("");
        setDeviceName("");
        setUsername("");
        setPassword("");
        setKeyPath("~/.ssh/id_rsa");
        setPassphrase("");
        setError("");
        setSelectedProfileId(null);
        setProfileName("");
        setView("connect");
    };

    const openSaveDialog = () => {
        setProfileName(deviceName || `${host}:${port}`);
        setView("save-profile");
    };

    if (!isOpen) return null;

    return (
        <div className="dialog-overlay" onClick={onClose}>
            <div className="dialog-content dialog-content-lg dialog-with-sidebar" onClick={(e) => e.stopPropagation()}>
                
                {/* Profiles Sidebar */}
                {profiles.length > 0 && (
                    <div className="dialog-sidebar">
                        <div className="sidebar-header">Profiles</div>
                        <div className="profile-list">
                            {profiles.map(profile => (
                                <div
                                    key={profile.id}
                                    className={`profile-item ${selectedProfileId === profile.id ? "active" : ""}`}
                                    onClick={() => loadProfile(profile)}
                                >
                                    <div className="profile-info">
                                        <span className="profile-name">{profile.name}</span>
                                        <span className="profile-type">{profile.connection_type.toUpperCase()}</span>
                                    </div>
                                    <button
                                        className="profile-delete"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteProfile(profile.id);
                                        }}
                                        title="Delete profile"
                                    >
                                        <DeleteIcon />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Main Content */}
                <div className="dialog-main">
                    <div className="dialog-header">
                        <NetworkIcon />
                        <h2>{view === "save-profile" ? "Save Profile" : "Connect to Device"}</h2>
                    </div>

                    {view === "save-profile" ? (
                        /* Save Profile View */
                        <div className="dialog-body">
                            <p className="dialog-description">
                                Save this connection as a profile for quick access.
                                Passwords are never stored for security.
                            </p>
                            <div className="form-group">
                                <label htmlFor="profileName">Profile Name *</label>
                                <input
                                    id="profileName"
                                    type="text"
                                    value={profileName}
                                    onChange={(e) => setProfileName(e.target.value)}
                                    placeholder="My Server"
                                    autoComplete="off"
                                    autoFocus
                                />
                            </div>

                            <div className="profile-preview">
                                <div className="preview-row">
                                    <span className="preview-label">Type:</span>
                                    <span className="preview-value">{mode.toUpperCase()}</span>
                                </div>
                                <div className="preview-row">
                                    <span className="preview-label">Host:</span>
                                    <span className="preview-value">{host}:{port}</span>
                                </div>
                                {mode === "ssh" && username && (
                                    <div className="preview-row">
                                        <span className="preview-label">User:</span>
                                        <span className="preview-value">{username}</span>
                                    </div>
                                )}
                            </div>

                            {error && <div className="form-error">{error}</div>}

                            <div className="dialog-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setView("connect")}>
                                    Back
                                </button>
                                <button type="button" className="btn btn-primary" onClick={saveProfile}>
                                    Save Profile
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Connect View */
                        <>
                            {/* Connection Mode Tabs */}
                            <div className="dialog-tabs">
                                <button
                                    type="button"
                                    className={`dialog-tab ${mode === "telnet" ? "active" : ""}`}
                                    onClick={() => handleModeChange("telnet")}
                                >
                                    Telnet
                                </button>
                                <button
                                    type="button"
                                    className={`dialog-tab ${mode === "ssh" ? "active" : ""}`}
                                    onClick={() => handleModeChange("ssh")}
                                >
                                    SSH
                                </button>
                            </div>

                            <form onSubmit={handleSubmit}>
                                <div className="dialog-body">
                                    <p className="dialog-description">
                                        {mode === "telnet" 
                                            ? "Connect to a GNS3/EVE-NG device console via Telnet."
                                            : "Connect to a network device or server via SSH."
                                        }
                                    </p>

                                    {/* Common Fields */}
                                    <div className="form-row">
                                        <div className="form-group form-group-flex">
                                            <label htmlFor="host">Host</label>
                                            <input
                                                ref={hostInputRef}
                                                id="host"
                                                type="text"
                                                value={host}
                                                onChange={(e) => setHost(e.target.value)}
                                                placeholder={mode === "telnet" ? "localhost" : "192.168.1.1"}
                                                autoComplete="off"
                                            />
                                        </div>

                                        <div className="form-group form-group-sm">
                                            <label htmlFor="port">Port</label>
                                            <input
                                                id="port"
                                                type="number"
                                                value={port}
                                                onChange={(e) => setPort(e.target.value)}
                                                placeholder={mode === "telnet" ? "5000" : "22"}
                                                min="1"
                                                max="65535"
                                                autoComplete="off"
                                            />
                                        </div>
                                    </div>

                                    {/* SSH-specific fields */}
                                    {mode === "ssh" && (
                                        <>
                                            <div className="form-group">
                                                <label htmlFor="username">Username *</label>
                                                <input
                                                    id="username"
                                                    type="text"
                                                    value={username}
                                                    onChange={(e) => setUsername(e.target.value)}
                                                    placeholder="admin"
                                                    autoComplete="off"
                                                    required
                                                />
                                            </div>

                                            <div className="form-group">
                                                <label>Authentication Method</label>
                                                <div className="auth-type-selector">
                                                    <label className="radio-label">
                                                        <input
                                                            type="radio"
                                                            name="authType"
                                                            value="password"
                                                            checked={authType === "password"}
                                                            onChange={() => setAuthType("password")}
                                                        />
                                                        Password
                                                    </label>
                                                    <label className="radio-label">
                                                        <input
                                                            type="radio"
                                                            name="authType"
                                                            value="publickey"
                                                            checked={authType === "publickey"}
                                                            onChange={() => setAuthType("publickey")}
                                                        />
                                                        <KeyIcon /> SSH Key
                                                    </label>
                                                </div>
                                            </div>

                                            {authType === "password" ? (
                                                <div className="form-group">
                                                    <label htmlFor="password">Password *</label>
                                                    <input
                                                        id="password"
                                                        type="password"
                                                        value={password}
                                                        onChange={(e) => setPassword(e.target.value)}
                                                        placeholder="••••••••"
                                                        autoComplete="off"
                                                    />
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="form-group">
                                                        <label htmlFor="keyPath">Private Key Path *</label>
                                                        <input
                                                            id="keyPath"
                                                            type="text"
                                                            value={keyPath}
                                                            onChange={(e) => setKeyPath(e.target.value)}
                                                            placeholder="~/.ssh/id_rsa"
                                                            autoComplete="off"
                                                        />
                                                        <span className="form-hint">
                                                            Path to your private key file (supports ~ for home directory)
                                                        </span>
                                                    </div>
                                                    <div className="form-group">
                                                        <label htmlFor="passphrase">Key Passphrase (optional)</label>
                                                        <input
                                                            id="passphrase"
                                                            type="password"
                                                            value={passphrase}
                                                            onChange={(e) => setPassphrase(e.target.value)}
                                                            placeholder="Leave empty if key is not encrypted"
                                                            autoComplete="off"
                                                        />
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    )}

                                    <div className="form-group">
                                        <label htmlFor="deviceName">Display Name (optional)</label>
                                        <input
                                            id="deviceName"
                                            type="text"
                                            value={deviceName}
                                            onChange={(e) => setDeviceName(e.target.value)}
                                            placeholder="R1, SW1, Server1, etc."
                                            autoComplete="off"
                                        />
                                    </div>

                                    {error && (
                                        <div className="form-error">{error}</div>
                                    )}
                                </div>

                                <div className="dialog-footer">
                                    <button 
                                        type="button" 
                                        className="btn btn-ghost" 
                                        onClick={openSaveDialog}
                                        title="Save as profile"
                                    >
                                        <SaveIcon /> Save
                                    </button>
                                    <div className="dialog-footer-right">
                                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                                            Cancel
                                        </button>
                                        <button type="submit" className="btn btn-primary">
                                            Connect
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
