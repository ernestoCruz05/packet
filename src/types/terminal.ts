/**
 * Terminal Types and Configuration
 * 
 * This module defines the core data structures and constants
 * used throughout the Packet terminal broadcast application.
 * 
 * @module types/terminal
 */

import { Terminal } from "@xterm/xterm";

/**
 * Connection type for terminal sessions
 */
export type ConnectionType = "local" | "telnet" | "ssh";

/**
 * Split direction for grid layouts
 */
export type SplitDirection = "horizontal" | "vertical";

/**
 * Telnet connection parameters for GNS3 devices
 */
export interface TelnetConnection {
    host: string;
    port: number;
}

/**
 * SSH authentication method
 */
export type SshAuthType = "password" | "publickey";

/**
 * SSH connection parameters
 */
export interface SshConnection {
    host: string;
    port: number;
    username: string;
    authType: SshAuthType;
    /** Password for password auth */
    password?: string;
    /** Path to private key file for publickey auth */
    keyPath?: string;
    /** Passphrase for encrypted private keys */
    passphrase?: string;
}

/**
 * Information about an active log file
 */
export interface LogFileInfo {
    path: string;
    startedAt: string;
}

/**
 * A saved connection profile
 */
export interface ConnectionProfile {
    id: string;
    name: string;
    connection_type: "ssh" | "telnet";
    host: string;
    port: number;
    username?: string;
    auth_method?: "password" | "publickey";
    key_path?: string;
    created_at: string;
    updated_at: string;
}

/**
 * A pane in the split layout - either contains a terminal or is split into children
 */
export interface SplitPane {
    /** Unique identifier for the pane */
    id: string;

    /** If this is a leaf pane, the terminal session ID it contains */
    sessionId?: string;

    /** If this is a split pane, the direction of the split */
    direction?: SplitDirection;

    /** Child panes if this is a split */
    children?: SplitPane[];

    /** Size ratio (0-1) relative to siblings */
    size: number;
}

/**
 * Layout mode for terminal display
 */
export type LayoutMode = "tabs" | "grid";

/**
 * A tab group for organizing related terminals
 */
export interface TabGroup {
    /** Unique identifier for the group */
    id: string;

    /** Display name for the group */
    name: string;

    /** Color for the group indicator */
    color: string;
}

/**
 * A workspace/group containing one or more terminal panes in a split layout
 */
export interface Workspace {
    /** Unique identifier for the workspace */
    id: string;

    /** Display name for the workspace tab */
    name: string;

    /** Root pane of the split layout */
    rootPane: SplitPane;

    /** List of session IDs in this workspace (for quick access) */
    sessionIds: string[];
}

/**
 * Represents a single terminal session with its associated state.
 * Each session corresponds to either a local PTY or a telnet connection.
 */
export interface TerminalSession {
    /** Unique identifier for the session (UUID v4) */
    id: string;

    /** User-editable display name for the terminal tab */
    name: string;

    /** Connection type: local shell, telnet, or SSH */
    connectionType: ConnectionType;

    /** Telnet connection info (only for telnet sessions) */
    telnetInfo?: TelnetConnection;

    /** SSH connection info (only for SSH sessions) */
    sshInfo?: SshConnection;

    /** Whether this terminal receives broadcast commands */
    broadcastEnabled: boolean;

    /** Reference to the xterm.js Terminal instance (null until mounted) */
    terminal: Terminal | null;

    /** Backend session identifier - PTY ID, telnet, or SSH session ID (null until connected) */
    sessionId: string | null;

    /** Group ID this session belongs to (null for ungrouped) */
    groupId: string | null;

    /** Active log files for this session */
    activeLogFiles?: LogFileInfo[];
}

/**
 * Global terminal state management interface.
 * Provides methods for managing multiple terminal sessions
 * and coordinating broadcast functionality.
 */
export interface TerminalState {
    /** Array of all active terminal sessions */
    sessions: TerminalSession[];

    /** Array of tab groups */
    groups: TabGroup[];

    /** ID of the currently active/visible terminal session */
    activeSessionId: string | null;

    /** ID of the currently active group (null shows all) */
    activeGroupId: string | null;

    /** Current layout mode (tabs or grid) */
    layoutMode: LayoutMode;

    /** Creates a new local terminal session */
    addSession: (groupId?: string | null) => void;

    /** Creates a new telnet session to a GNS3 device */
    addTelnetSession: (host: string, port: number, name?: string) => void;

    /** Creates a new SSH session to a device/server */
    addSshSession: (connection: SshConnection, name?: string) => void;

    /** Removes and cleans up a terminal session by ID */
    removeSession: (id: string) => void;

    /** Sets the active terminal session */
    setActiveSession: (id: string) => void;

    /** Toggles broadcast enabled/disabled for a session */
    toggleBroadcast: (id: string) => void;

    /** Updates the display name of a session */
    updateSessionName: (id: string, name: string) => void;

    /** Associates an xterm.js Terminal instance with a session */
    setTerminal: (id: string, terminal: Terminal) => void;

    /** Associates a backend session ID (PTY or telnet) with a session */
    setSessionId: (id: string, sessionId: string) => void;

    /** 
     * Sends a single keystroke to broadcast-enabled terminals
     * @param key - The keystroke to send
     * @param groupId - Optional group filter (null = all, string = specific group)
     */
    broadcastKeystroke: (key: string, groupId?: string | null) => void;

    /** Toggles between tabs and grid layout mode */
    toggleLayoutMode: () => void;

    /** Creates a new tab group */
    addGroup: (name: string) => void;

    /** Removes a tab group */
    removeGroup: (id: string) => void;

    /** Renames a tab group */
    renameGroup: (id: string, name: string) => void;

    /** Sets the active group filter */
    setActiveGroup: (id: string | null) => void;

    /** Moves a session to a group */
    moveToGroup: (sessionId: string, groupId: string | null) => void;
}

/**
 * Network device command syntax keywords for highlighting.
 * Organized by category for Cisco IOS and similar network OS commands.
 * 
 * Categories:
 * - commands: Primary CLI commands
 * - protocols: Network protocols and services  
 * - interfaces: Interface types and abbreviations
 * - status: State and status keywords
 * - keywords: Configuration parameters and options
 */
export const CiscoKeywords = {
    /** Primary CLI commands */
    commands: [
        "show",
        "configure",
        "terminal",
        "interface",
        "router",
        "ip",
        "ipv6",
        "no",
        "enable",
        "disable",
        "exit",
        "end",
        "write",
        "copy",
        "ping",
        "traceroute",
        "debug",
        "undebug",
        "clear",
        "reload",
        "shutdown",
        "hostname",
        "banner",
        "line",
        "logging",
        "snmp-server",
        "access-list",
        "permit",
        "deny",
        "route-map",
        "prefix-list",
        "crypto",
        "tunnel",
        "spanning-tree",
        "vtp",
        "switchport",
        "service",
        "clock",
        "ntp",
    ],

    /** Network protocols and services */
    protocols: [
        "ospf",
        "bgp",
        "eigrp",
        "rip",
        "isis",
        "mpls",
        "ldp",
        "tcp",
        "udp",
        "icmp",
        "arp",
        "cdp",
        "lldp",
        "stp",
        "rstp",
        "pvst",
        "hsrp",
        "vrrp",
        "glbp",
        "nat",
        "pat",
        "dhcp",
        "dns",
        "ntp",
        "ssh",
        "telnet",
        "ftp",
        "tftp",
        "snmp",
        "syslog",
        "http",
        "https",
        "radius",
        "tacacs",
    ],

    /** Interface types and common abbreviations */
    interfaces: [
        "FastEthernet",
        "GigabitEthernet",
        "TenGigabitEthernet",
        "Serial",
        "Loopback",
        "Vlan",
        "Port-channel",
        "Tunnel",
        "Dialer",
        "BVI",
        "Ethernet",
        "Fa",
        "Gi",
        "Te",
        "Se",
        "Lo",
        "Po",
        "Vl",
    ],

    /** State and status indicators */
    status: [
        "up",
        "down",
        "administratively",
        "connected",
        "notconnect",
        "disabled",
        "errdisabled",
        "blocking",
        "forwarding",
        "learning",
        "listening",
        "active",
        "standby",
    ],

    /** Configuration parameters and options */
    keywords: [
        "address",
        "mask",
        "network",
        "area",
        "neighbor",
        "remote-as",
        "local-as",
        "password",
        "secret",
        "encryption",
        "authentication",
        "vlan",
        "trunk",
        "access",
        "native",
        "allowed",
        "cost",
        "priority",
        "metric",
        "bandwidth",
        "delay",
        "mtu",
        "duplex",
        "speed",
        "description",
        "default-gateway",
        "default-router",
        "lease",
        "pool",
        "range",
        "exclude",
        "timeout",
        "interval",
        "version",
        "passive-interface",
        "redistribute",
    ],
} as const;

/** Type for keyword categories */
export type KeywordCategory = keyof typeof CiscoKeywords;
