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
export type ConnectionType = "local" | "telnet";

/**
 * Telnet connection parameters for GNS3 devices
 */
export interface TelnetConnection {
    host: string;
    port: number;
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

    /** Connection type: local shell or telnet to GNS3 */
    connectionType: ConnectionType;

    /** Telnet connection info (only for telnet sessions) */
    telnetInfo?: TelnetConnection;

    /** Whether this terminal receives broadcast commands */
    broadcastEnabled: boolean;

    /** Reference to the xterm.js Terminal instance (null until mounted) */
    terminal: Terminal | null;

    /** Backend session identifier - PTY ID or telnet session ID (null until connected) */
    sessionId: string | null;
}

/**
 * Global terminal state management interface.
 * Provides methods for managing multiple terminal sessions
 * and coordinating broadcast functionality.
 */
export interface TerminalState {
    /** Array of all active terminal sessions */
    sessions: TerminalSession[];

    /** ID of the currently active/visible terminal session */
    activeSessionId: string | null;

    /** Creates a new local terminal session */
    addSession: () => void;

    /** Creates a new telnet session to a GNS3 device */
    addTelnetSession: (host: string, port: number, name?: string) => void;

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

    /** Sends a single keystroke to all broadcast-enabled terminals */
    broadcastKeystroke: (key: string) => void;
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
