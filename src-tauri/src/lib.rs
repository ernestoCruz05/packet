//! Packet - Terminal Broadcast System for GNS3
//!
//! A professional terminal multiplexer with broadcast capabilities,
//! designed for network engineers and system administrators who need
//! to manage multiple terminal sessions simultaneously.
//!
//! # Features
//!
//! - Multiple concurrent terminal sessions (local PTY, telnet, or SSH)
//! - Telnet connections to GNS3 network devices
//! - SSH connections to network devices and servers
//! - Session logging with command-based control (:l/:el commands)
//! - Broadcast commands to selected terminals
//! - Per-terminal broadcast toggle
//! - Full PTY support with resize handling
//! - CLI arguments for GNS3 integration
//! - Single instance mode - new connections open in existing window
//!
//! # GNS3 Integration
//!
//! Set in GNS3 → Edit → Preferences → Console applications:
//! ```
//! packet --name "{name}" --host {host} --port {port}
//! ```
//!
//! # Architecture
//!
//! The application uses Tauri as the bridge between the React frontend
//! and the Rust backend. Sessions can be either:
//! - Local PTY sessions (bash/shell)
//! - Telnet sessions (GNS3 routers/switches)
//! - SSH sessions (network devices, servers)

mod cli;
mod logging;
mod profiles;
mod pty;
mod ssh;
mod telnet;

use cli::{get_cli_connection, init_cli, parse_args_to_connection};
use logging::{list_session_logs, start_logging, stop_logging};
use profiles::{create_profile, delete_profile, get_profile, list_profiles, update_profile, ProfileStore};
use pty::{kill_pty, resize_pty, spawn_pty, write_to_pty, PtyState};
use ssh::{connect_ssh, disconnect_ssh, list_ssh_sessions, resize_ssh, write_ssh};
use telnet::{connect_telnet, disconnect_telnet, list_telnet_sessions, write_telnet};
use tauri::{Emitter, Manager};

/// Application entry point for Tauri.
///
/// Initializes the application with:
/// - Single instance behavior (subsequent launches send args to existing instance)
/// - CLI argument parsing for GNS3 integration
/// - Global PTY state management
/// - Telnet connection handling
/// - Tauri plugin for system integration
/// - Command handlers for PTY and telnet operations
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Parse CLI arguments first
    let cli_connection = init_cli();
    
    if let Some(ref conn) = cli_connection {
        println!("[Packet] Starting with connection: {} ({}:{})", 
            conn.name, conn.host, conn.port);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // This runs in the EXISTING instance when a new instance tries to start
            println!("[Packet] Received args from new instance: {:?}", args);
            
            // Parse the args to get connection info
            if let Some(conn) = parse_args_to_connection(&args) {
                println!("[Packet] New connection request: {} ({}:{})", 
                    conn.name, conn.host, conn.port);
                
                // Emit event to frontend to create a new telnet session
                if let Some(window) = app.get_webview_window("main") {
                    // Focus the existing window
                    let _ = window.set_focus();
                    let _ = window.unminimize();
                    
                    // Send the connection info to the frontend
                    let _ = window.emit("new-connection", serde_json::json!({
                        "host": conn.host,
                        "port": conn.port,
                        "name": conn.name,
                    }));
                }
            }
        }))
        .manage(PtyState::default())
        .manage(ProfileStore::new())
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
            // SSH commands (network devices, servers)
            connect_ssh,
            write_ssh,
            resize_ssh,
            disconnect_ssh,
            list_ssh_sessions,
            // Logging commands
            start_logging,
            stop_logging,
            list_session_logs,
            // Profile commands
            create_profile,
            update_profile,
            delete_profile,
            list_profiles,
            get_profile,
            // CLI commands
            get_cli_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
