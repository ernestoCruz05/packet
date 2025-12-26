/**
 * Cisco IOS Syntax Highlighting for Terminal Output
 * * This module provides real-time syntax highlighting for Cisco IOS
 * terminal output by injecting ANSI color codes around recognized keywords.
 */

const COLORS = {
  reset: "\x1b[0m",
  command: "\x1b[38;5;75m",    // Blue
  protocol: "\x1b[38;5;177m",  // Purple
  interface: "\x1b[38;5;215m", // Orange
  ip: "\x1b[38;5;221m",        // Yellow
  statusUp: "\x1b[38;5;46m",   // Green
  statusDown: "\x1b[38;5;196m",// Red
  prompt: "\x1b[1;37m",        // Bold White
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

// Status keywords
const STATUS_UP = new Set(["up", "established", "connected", "enabled", "active", "full", "forwarding"]);
const STATUS_DOWN = new Set(["down", "disabled", "inactive", "administratively", "blocking", "err-disabled", "notconnect"]);

// ANSI Escape sequence pattern
const P_ANSI = /\x1b\[[0-9;]*m/;

// Specific case-patterns
const P_IP = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?:\/\d{1,2})?/;
const P_INTERFACE = /(?:Gi|Fa|Et|Se|Lo|Vl|Po|Tu)[a-z-]*\d+(?:\/\d+)*(?:\.\d+)?/;
const P_PROMPT = /[A-Za-z0-9_-]+[#>]\s*$/;

// Generic word pattern
const P_WORD = /[a-zA-Z0-9_-]+/;

const MASTER_REGEX = new RegExp(
  `(${P_ANSI.source})|` +       // Group 1: ANSI (Ignore)
  `(${P_IP.source})|` +         // Group 2: IP
  `(${P_INTERFACE.source})|` +  // Group 3: Interface
  `(${P_PROMPT.source})|` +     // Group 4: Prompt
  `(${P_WORD.source})`,         // Group 5: Generic Word (Check against Sets)
  'g'
);

/**
 * Apply syntax highlighting to Cisco terminal output
 */
export function highlightCiscoOutput(text: string, enabled: boolean = true): string {
  if (!enabled || !text) return text;

  return text.replace(MASTER_REGEX, (match, ansi, ip, intf, prompt, word) => {
    // 1. If it's an existing ANSI code, return it untouched
    if (ansi) return match;

    // 2. IPs
    if (ip) return `${COLORS.ip}${match}${COLORS.reset}`;

    // 3. Interfaces (GigabitEthernet0/1)
    if (intf) return `${COLORS.interface}${match}${COLORS.reset}`;

    // 4. Prompts (Router#)
    if (prompt) return `${COLORS.prompt}${match}${COLORS.reset}`;

    // 5. Generic Words - Check against our dictionaries
    if (word) {
      const lower = word.toLowerCase();
      if (COMMANDS.has(lower)) return `${COLORS.command}${match}${COLORS.reset}`;
      if (STATUS_UP.has(lower)) return `${COLORS.statusUp}${match}${COLORS.reset}`;
      if (STATUS_DOWN.has(lower)) return `${COLORS.statusDown}${match}${COLORS.reset}`;
    }

    // No match? Return text as-is
    return match;
  });
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
