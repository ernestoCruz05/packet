# Packet

**Packet** is a professional terminal multiplexer and broadcast system designed specifically for network engineers and system administrators. It serves as a modern replacement for tools like SecureCRT or SuperPutty, with deep integration for **GNS3** and **EVE-NG**.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Build](https://img.shields.io/badge/build-rust%20%7C%20tauri%20%7C%20react-green)

## Features

* **Broadcast Mode**: Type commands once and execute them simultaneously across multiple selected network devices.
* **GNS3 Integration**: Acts as the default console application for GNS3, opening new connections in tabs within a single window.
* **Multi-Protocol Support**:
    * **Telnet**: Optimized for Cisco/Juniper console connections.
    * **Local Shell**: Full PTY support for local Bash/PowerShell sessions.
* **Cisco Syntax Highlighting**: Automatic coloring of interface status, errors, and configuration lines.
* **Tab Management**: Split panes and easy navigation between dozens of active sessions.

## Installation

### Prerequisites
* **Rust**: (v1.70+)
* **Node.js**: (v18+)
* **Pnpm/Npm/Yarn**

### Building from Source

1.  Clone the repository:
    ```bash
    git clone [https://github.com/yourusername/packet.git](https://github.com/yourusername/packet.git)
    cd packet
    ```

2.  Install frontend dependencies:
    ```bash
    npm install
    # or
    pnpm install
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
2.  Go to **Edit** -> **Preferences** -> **General** -> **Console applications**.
3.  Click **Edit** on your preferred predefined command or create a new one.
4.  Set the command to:
    ```bash
    /path/to/packet --name "{name}" --host {host} --port {port}
    ```
    *(Replace `/path/to/packet` with the actual path to your built executable)*

Now, when you double-click a router in GNS3, it will automatically open as a new tab in your existing Packet window.

## Architecture

Packet uses **Tauri v2** to bridge a high-performance Rust backend with a React frontend.

* **Frontend**: React + TypeScript + Vite. Uses `xterm.js` for terminal rendering.
* **Backend**: Rust.
    * **PTY**: Uses `portable-pty` to spawn real pseudo-terminals for local shells.
    * **Telnet**: Custom TCP implementation to handle GNS3 console streams.
    * **IPC**: Asynchronous event streams push terminal data from Rust threads to the React UI.

## Project Structure

* `src-tauri/src/lib.rs`: Main entry point and GNS3 CLI argument parsing.
* `src-tauri/src/telnet.rs`: Telnet protocol implementation.
* `src-tauri/src/pty.rs`: Local shell session management.
* `src/components/TerminalPanel.tsx`: The terminal UI component managing xterm.js instances.

## License

MIT License
