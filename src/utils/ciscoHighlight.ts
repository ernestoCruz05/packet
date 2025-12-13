/**
 * Cisco IOS Syntax Highlighting for Terminal Output
 * 
 * This module provides real-time syntax highlighting for Cisco IOS
 * terminal output by injecting ANSI color codes around recognized keywords.
 * 
 * The highlighting is designed to be non-destructive - it preserves
 * existing ANSI sequences and only colorizes plain text keywords.
 */

// ANSI escape code sequences for colors
const ANSI = {
    reset: "\x1b[0m",
    // Commands - Bright Blue
    command: "\x1b[38;5;75m",
    // Protocols - Magenta/Purple
    protocol: "\x1b[38;5;177m",
    // Interfaces - Orange
    interface: "\x1b[38;5;215m",
    // Keywords - Green
    keyword: "\x1b[38;5;114m",
    // IP addresses - Yellow
    ip: "\x1b[38;5;221m",
    // Status up/enabled - Bright Green
    statusUp: "\x1b[38;5;46m",
    // Status down/disabled - Red
    statusDown: "\x1b[38;5;196m",
    // Numbers/metrics - Cyan
    number: "\x1b[38;5;81m",
    // Prompts - Bold white
    prompt: "\x1b[1;37m",
};

// Cisco command keywords (case-insensitive matching)
const COMMANDS = new Set([
    "show", "configure", "terminal", "interface", "router", "ip",
    "no", "enable", "disable", "shutdown", "exit", "end", "write",
    "copy", "ping", "traceroute", "debug", "undebug", "clear",
    "reload", "hostname", "banner", "line", "logging", "snmp-server",
    "access-list", "route-map", "prefix-list", "crypto", "tunnel",
    "clock", "ntp", "spanning-tree", "vlan", "switchport", "channel-group",
    "description", "speed", "duplex", "negotiate", "encapsulation",
    "service", "aaa", "username", "password", "secret", "privilege",
    "exec-timeout", "transport", "login", "vty", "console", "aux",
    "memory", "running-config", "startup-config", "version", "brief",
    "detail", "summary", "status", "neighbors", "run", "start",
]);

// Protocol keywords
const PROTOCOLS = new Set([
    "ospf", "eigrp", "bgp", "rip", "isis", "mpls", "ldp", "vrf",
    "tcp", "udp", "icmp", "arp", "dhcp", "dns", "http", "https",
    "ssh", "telnet", "ftp", "tftp", "snmp", "ntp", "syslog",
    "hsrp", "vrrp", "glbp", "lacp", "pagp", "stp", "rstp", "mstp",
    "pvst", "dot1q", "isl", "gre", "ipsec", "isakmp", "esp", "ah",
    "radius", "tacacs", "ldap", "ppp", "hdlc", "frame-relay",
    "ethernet", "gigabitethernet", "fastethernet", "serial",
]);

// Interface patterns
const INTERFACE_PATTERNS = [
    /\b(Gi(?:gabit)?(?:Ethernet)?)\d+(?:\/\d+)*(?:\.\d+)?\b/gi,
    /\b(Fa(?:st)?(?:Ethernet)?)\d+(?:\/\d+)*(?:\.\d+)?\b/gi,
    /\b(Et(?:h(?:ernet)?)?)\d+(?:\/\d+)*(?:\.\d+)?\b/gi,
    /\b(Se(?:rial)?)\d+(?:\/\d+)*(?:\.\d+)?\b/gi,
    /\b(Lo(?:opback)?)\d+\b/gi,
    /\b(Vl(?:an)?)\d+\b/gi,
    /\b(Tu(?:nnel)?)\d+\b/gi,
    /\b(Po(?:rt-channel)?)\d+\b/gi,
    /\b(Null)\d+\b/gi,
    /\b(Dialer)\d+\b/gi,
    /\b(BVI)\d+\b/gi,
];

// Status keywords
const STATUS_UP = new Set(["up", "established", "connected", "enabled", "active", "full", "forwarding"]);
const STATUS_DOWN = new Set(["down", "disabled", "inactive", "administratively", "blocking", "err-disabled", "notconnect"]);

// Router prompt pattern (e.g., "Router#", "R1(config)#", "Switch>")
const PROMPT_PATTERN = /^([A-Za-z][A-Za-z0-9_-]*(?:\([a-z-]+\))?[#>])\s*/gm;

// IPv4 address pattern
const IPV4_PATTERN = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?:\/\d{1,2})?)\b/g;

// IPv6 address pattern (simplified)
const IPV6_PATTERN = /\b([0-9a-fA-F:]+::[0-9a-fA-F:]*|[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){7})(?:\/\d{1,3})?\b/g;

// MAC address pattern
const MAC_PATTERN = /\b([0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}|[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5})\b/g;

/**
 * Check if a string position is inside an ANSI escape sequence
 */
function isInsideAnsiSequence(text: string, position: number): boolean {
    // Look backwards for ESC
    let escPos = -1;
    for (let i = position - 1; i >= 0 && i >= position - 20; i--) {
        if (text[i] === '\x1b') {
            escPos = i;
            break;
        }
    }
    if (escPos === -1) return false;

    // Check if there's a terminator 'm' between ESC and position
    const between = text.substring(escPos, position);
    return !between.includes('m');
}

/**
 * Apply syntax highlighting to Cisco terminal output
 * 
 * @param text - Raw terminal output text
 * @param enabled - Whether highlighting is enabled
 * @returns Text with ANSI color codes for syntax highlighting
 */
export function highlightCiscoOutput(text: string, enabled: boolean = true): string {
    if (!enabled || !text) return text;

    // Don't process if text is too short or looks like control sequences only
    if (text.length < 2) return text;

    let result = text;

    // Helper to safely replace without touching existing ANSI sequences
    const safeReplace = (
        pattern: RegExp,
        colorCode: string,
        validator?: (match: string) => boolean
    ): void => {
        result = result.replace(pattern, (match, ...args) => {
            // Get the position from the last argument (offset)
            const offset = args[args.length - 2] as number;

            // Skip if inside an existing ANSI sequence
            if (isInsideAnsiSequence(result, offset)) {
                return match;
            }

            // Skip if validator fails
            if (validator && !validator(match)) {
                return match;
            }

            return `${colorCode}${match}${ANSI.reset}`;
        });
    };

    // Highlight IP addresses first (they're most distinctive)
    safeReplace(IPV4_PATTERN, ANSI.ip, (match) => {
        // Validate it's a real IP (each octet 0-255)
        const parts = match.split('/')[0].split('.');
        return parts.every(p => {
            const n = parseInt(p, 10);
            return n >= 0 && n <= 255;
        });
    });

    // Highlight IPv6
    safeReplace(IPV6_PATTERN, ANSI.ip);

    // Highlight MAC addresses
    safeReplace(MAC_PATTERN, ANSI.protocol);

    // Highlight interfaces
    for (const pattern of INTERFACE_PATTERNS) {
        safeReplace(pattern, ANSI.interface);
    }

    // Highlight router prompts
    result = result.replace(PROMPT_PATTERN, (match) => {
        return `${ANSI.prompt}${match}${ANSI.reset}`;
    });

    // Highlight status keywords (must be whole words)
    const statusUpPattern = new RegExp(`\\b(${Array.from(STATUS_UP).join('|')})\\b`, 'gi');
    const statusDownPattern = new RegExp(`\\b(${Array.from(STATUS_DOWN).join('|')})\\b`, 'gi');

    safeReplace(statusUpPattern, ANSI.statusUp);
    safeReplace(statusDownPattern, ANSI.statusDown);

    // Highlight commands (whole words, at word boundaries)
    const commandPattern = new RegExp(`\\b(${Array.from(COMMANDS).join('|')})\\b`, 'gi');
    safeReplace(commandPattern, ANSI.command);

    // Highlight protocols
    const protocolPattern = new RegExp(`\\b(${Array.from(PROTOCOLS).join('|')})\\b`, 'gi');
    safeReplace(protocolPattern, ANSI.protocol);

    return result;
}

/**
 * Configuration for highlighting behavior
 */
export interface HighlightConfig {
    enabled: boolean;
    highlightIPs: boolean;
    highlightCommands: boolean;
    highlightInterfaces: boolean;
    highlightStatus: boolean;
}

export const defaultHighlightConfig: HighlightConfig = {
    enabled: true,
    highlightIPs: true,
    highlightCommands: true,
    highlightInterfaces: true,
    highlightStatus: true,
};
