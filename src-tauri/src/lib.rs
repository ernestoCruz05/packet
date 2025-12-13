//! Packet - Terminal Broadcast System for GNS3
//!
//! A professional terminal multiplexer with broadcast capabilities,
//! designed for network engineers and system administrators who need
//! to manage multiple terminal sessions simultaneously.
//!
//! # Features
//!
//! - Multiple concurrent terminal sessions (local PTY or telnet)
//! - Telnet connections to GNS3 network devices
//! - Broadcast commands to selected terminals
//! - Per-terminal broadcast toggle
//! - Full PTY support with resize handling
//!
//! # Architecture
//!
//! The application uses Tauri as the bridge between the React frontend
//! and the Rust backend. Sessions can be either:
//! - Local PTY sessions (bash/shell)
//! - Telnet sessions (GNS3 routers/switches)

mod pty;
mod telnet;

use pty::{kill_pty, resize_pty, spawn_pty, write_to_pty, PtyState};
use telnet::{connect_telnet, disconnect_telnet, list_telnet_sessions, write_telnet};

/// Application entry point for Tauri.
///
/// Initializes the application with:
/// - Global PTY state management
/// - Telnet connection handling
/// - Tauri plugin for system integration
/// - Command handlers for PTY and telnet operations
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(PtyState::default())
        .invoke_handler(tauri::generate_handler![
            // PTY commands (local shell)
            spawn_pty,
            write_to_pty,
            resize_pty,
            kill_pty,
            // Telnet commands (GNS3 devices)
            connect_telnet,
            write_telnet,
            disconnect_telnet,
            list_telnet_sessions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
