# Packet

**Packet** is a professional terminal multiplexer and broadcast system designed specifically for network engineers and system administrators. It serves as a modern replacement for tools like SecureCRT or SuperPutty, with deep integration for **GNS3** and **EVE-NG**.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Build](https://img.shields.io/badge/build-rust%20%7C%20tauri%20%7C%20react-green)

## Features

### Core Capabilities
* **Broadcast Mode**: Type commands once and execute them simultaneously across multiple selected network devices.
* **GNS3/EVE-NG Integration**: Acts as the default console application, opening new connections in tabs within a single window.
* **Connection Profiles**: Save frequently used connections for quick access. Passwords are never stored for security.

### Multi-Protocol Support
* **SSH**: Full SSH2 support with password and public key authentication.
* **Telnet**: Optimized for Cisco/Juniper console connections.
* **Local Shell**: Full PTY support for local Bash/PowerShell sessions.

### Session Logging
Log terminal output to files using vim-style commands:
* `:l <filename>` - Start logging to `~/packet-logs/<filename>`
* `:el <filename>` - Stop logging
* `:logs` - List active log files

### Broadcast Commands
Control broadcast targeting with vim-style commands:
* `:a` or `:all` - Broadcast to all terminals
* `:local` - Broadcast to current group only
* `:g <name>` - Broadcast to a specific group
* `:m <pattern> <group>` - Move terminals matching pattern to group (supports wildcards: `R-*`, `SW-?`)
* `:s <group>` - Switch to viewing a group (`:s all` for all)

### User Interface
* **Cisco Syntax Highlighting**: Automatic coloring of commands, interfaces, and IP addresses.
* **Tab Management**: Split panes, groups, and easy navigation between sessions.
* **Dark Theme**: Professional dark theme optimized for long work sessions.

## Installation

### Prerequisites
* **Rust**: (v1.70+)
* **Node.js**: (v18+)
* **pnpm/npm/yarn**

### Building from Source

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/packet.git
    cd packet
    ```

2.  Install frontend dependencies:
    ```bash
    npm install
    ```

3.  Run in development mode:
    ```bash
    npm run tauri dev
    ```

4.  Build a release executable:
    ```bash
    npm run tauri build
    ```
    The binary will be available in `src-tauri/target/release/`.

## GNS3 Configuration

To make Packet the default console application for GNS3:

1.  Open GNS3.
2.  Go to **Edit** → **Preferences** → **General** → **Console applications**.
3.  Click **Edit** on your preferred predefined command or create a new one.
4.  Set the command to:
    ```bash
    /path/to/packet --name "{name}" --host {host} --port {port}
    ```
    *(Replace `/path/to/packet` with the actual path to your built executable)*

Now, when you double-click a router in GNS3, it will automatically open as a new tab in your existing Packet window.

## Usage

### Connecting to Devices

1. Click **Connect** in the title bar
2. Choose **Telnet** or **SSH** tab
3. Enter connection details
4. Optionally click **Save** to create a profile for quick access
5. Click **Connect**

### Broadcast Mode

1. Double-click a terminal tab to enable/disable broadcast for that session
2. Type commands in the broadcast input bar at the bottom
3. All enabled terminals receive keystrokes in real-time

### Session Groups

Organize terminals into groups for targeted broadcasting:
1. Click **New Group** to create a group
2. Use `:m R-* Routers` to move all terminals starting with "R-" to the "Routers" group
3. Use `:g Routers` to broadcast only to that group

## Architecture

Packet uses **Tauri v2** to bridge a high-performance Rust backend with a React frontend.

* **Frontend**: React + TypeScript + Vite. Uses `xterm.js` for terminal rendering.
* **Backend**: Rust.
    * **SSH**: Uses `ssh2` crate for SSH2 protocol support.
    * **PTY**: Uses `portable-pty` for local pseudo-terminals.
    * **Telnet**: Custom TCP implementation for GNS3 console streams.
    * **Logging**: Session output logging with ANSI code stripping.
    * **Profiles**: JSON-based connection profile storage.

## Project Structure

```
src-tauri/src/
├── lib.rs        # Main entry point and command handlers
├── ssh.rs        # SSH2 connection management
├── telnet.rs     # Telnet protocol implementation
├── pty.rs        # Local shell session management
├── logging.rs    # Session logging to files
├── profiles.rs   # Connection profile storage
└── cli.rs        # GNS3 CLI argument parsing

src/
├── components/
│   ├── TerminalPanel.tsx   # Terminal UI with xterm.js
│   ├── ConnectDialog.tsx   # Connection dialog with profiles
│   ├── BroadcastInput.tsx  # Broadcast command input
│   └── ...
├── context/
│   └── TerminalContext.tsx # Session state management
└── types/
    └── terminal.ts         # TypeScript type definitions
```

## License

MIT License
