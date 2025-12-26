//! SSH Connection Module for Packet
//!
//! This module provides SSH connectivity for network devices and servers.
//! Supports password authentication and key-based authentication.
//!
//! # Architecture
//!
//! Each SSH session maintains:
//! - A TCP connection with SSH2 session
//! - A channel for shell interaction  
//! - A reader thread that emits output events to the frontend
//! - Writer access for sending commands
//!
//! # Authentication Methods
//!
//! 1. Password - Traditional username/password
//! 2. PublicKey - SSH key file (with optional passphrase)

use crate::logging::{cleanup_session_logs, write_to_logs};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use ssh2::{Channel, Session};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

/// Buffer size for reading SSH output (8KB)
const SSH_READ_BUFFER_SIZE: usize = 8192;

/// Connection timeout in seconds
const CONNECTION_TIMEOUT_SECS: u64 = 30;

/// Authentication method for SSH connections
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SshAuthMethod {
    /// Password authentication
    #[serde(rename = "password")]
    Password { password: String },

    /// Public key authentication
    #[serde(rename = "publickey")]
    PublicKey {
        /// Path to private key file
        #[serde(rename = "keyPath")]
        key_path: String,
        /// Optional passphrase for encrypted keys
        passphrase: Option<String>,
    },
}

/// Wrapper for Channel that implements Send
pub(crate) struct SendChannel(Channel);

// Safety: We protect all access with a mutex
unsafe impl Send for SendChannel {}

/// Represents an active SSH session
pub struct SshSession {
    /// The SSH channel for I/O (wrapped for thread-safe access)
    pub(crate) channel: Arc<Mutex<SendChannel>>,
    /// Connection info for display
    pub host: String,
    pub port: u16,
    pub username: String,
    /// Flag to signal reader thread to stop
    pub running: Arc<Mutex<bool>>,
}

/// Global state for all SSH sessions
static SSH_SESSIONS: Lazy<Arc<Mutex<HashMap<String, SshSession>>>> = Lazy::new(|| {
    println!("[SSH] Initializing global SSH session store");
    Arc::new(Mutex::new(HashMap::new()))
});

/// Event payload emitted when SSH output is available
#[derive(Clone, Serialize, Deserialize)]
pub struct SshOutput {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub data: String,
}

/// Event payload for SSH connection status updates
#[derive(Clone, Serialize, Deserialize)]
pub struct SshConnectionStatus {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub status: String,
    pub message: String,
}

/// Establishes a new SSH connection
///
/// # Arguments
/// * `app` - Tauri application handle for emitting events
/// * `host` - Hostname or IP address
/// * `port` - SSH port (typically 22)
/// * `username` - SSH username
/// * `auth` - Authentication method (password or public key)
/// * `cols` - Terminal columns
/// * `rows` - Terminal rows
///
/// # Returns
/// Session ID string on success
#[tauri::command]
pub fn connect_ssh(
    app: AppHandle,
    host: String,
    port: u16,
    username: String,
    auth: SshAuthMethod,
    cols: u32,
    rows: u32,
) -> Result<String, String> {
    println!("[SSH] Connecting to {}@{}:{}", username, host, port);

    let session_id = Uuid::new_v4().to_string();
    println!("[SSH] Generated session ID: {}", session_id);

    let sessions_ptr = SSH_SESSIONS.clone();

    // Create TCP connection with timeout
    let addr = format!("{}:{}", host, port);
    let tcp = TcpStream::connect_timeout(
        &addr
            .parse()
            .map_err(|e| format!("Invalid address '{}': {}", addr, e))?,
        Duration::from_secs(CONNECTION_TIMEOUT_SECS),
    )
    .map_err(|e| format!("TCP connection failed: {}", e))?;

    // Configure the stream
    tcp.set_read_timeout(Some(Duration::from_millis(100)))
        .map_err(|e| format!("Failed to set read timeout: {}", e))?;
    tcp.set_nodelay(true)
        .map_err(|e| format!("Failed to set nodelay: {}", e))?;

    // Create SSH session
    let mut session =
        Session::new().map_err(|e| format!("Failed to create SSH session: {}", e))?;

    session.set_tcp_stream(tcp);
    session
        .handshake()
        .map_err(|e| format!("SSH handshake failed: {}", e))?;

    // Authenticate based on method
    match &auth {
        SshAuthMethod::Password { password } => {
            session
                .userauth_password(&username, password)
                .map_err(|e| format!("Password authentication failed: {}", e))?;
        }
        SshAuthMethod::PublicKey {
            key_path,
            passphrase,
        } => {
            let key_path = PathBuf::from(key_path);

            // Expand ~ to home directory
            let expanded_path = if key_path.starts_with("~") {
                if let Some(home) = dirs::home_dir() {
                    home.join(key_path.strip_prefix("~").unwrap_or(&key_path))
                } else {
                    key_path
                }
            } else {
                key_path
            };

            session
                .userauth_pubkey_file(&username, None, &expanded_path, passphrase.as_deref())
                .map_err(|e| format!("Public key authentication failed: {}", e))?;
        }
    }

    if !session.authenticated() {
        return Err("Authentication failed - check credentials".to_string());
    }

    println!("[SSH] Authentication successful for {}", session_id);

    // Open a channel and request PTY
    let mut channel = session
        .channel_session()
        .map_err(|e| format!("Failed to open channel: {}", e))?;

    // Request pseudo-terminal with xterm-256color for color support
    channel
        .request_pty("xterm-256color", None, Some((cols, rows, 0, 0)))
        .map_err(|e| format!("Failed to request PTY: {}", e))?;

    // Start shell
    channel
        .shell()
        .map_err(|e| format!("Failed to start shell: {}", e))?;

    // Make session non-blocking for reading
    session.set_blocking(false);

    let running = Arc::new(Mutex::new(true));
    let running_clone = running.clone();

    // Wrap channel in Arc<Mutex> for shared access
    let channel = Arc::new(Mutex::new(SendChannel(channel)));
    let channel_for_reader = channel.clone();

    // Store session
    {
        let mut sessions = sessions_ptr.lock();
        sessions.insert(
            session_id.clone(),
            SshSession {
                channel,
                host: host.clone(),
                port,
                username: username.clone(),
                running,
            },
        );
        println!(
            "[SSH] Session {} stored. Total sessions: {}",
            session_id,
            sessions.len()
        );
    }

    // Emit connection success
    let _ = app.emit(
        "ssh-status",
        SshConnectionStatus {
            session_id: session_id.clone(),
            status: "connected".to_string(),
            message: format!("Connected to {}@{}:{}", username, host, port),
        },
    );

    // Spawn reader thread
    let session_id_read = session_id.clone();
    let sessions_for_cleanup = sessions_ptr.clone();
    let host_display = host.clone();
    let username_display = username.clone();

    thread::spawn(move || {
        println!("[SSH] Reader thread started for {}", session_id_read);
        let mut buf = [0u8; SSH_READ_BUFFER_SIZE];

        loop {
            // Check if we should stop
            if !*running_clone.lock() {
                println!("[SSH] Reader thread stopping for {}", session_id_read);
                break;
            }

            // Try to read from channel
            let read_result = {
                let mut channel_guard = channel_for_reader.lock();
                channel_guard.0.read(&mut buf)
            };

            match read_result {
                Ok(0) => {
                    // Check if channel is at EOF
                    let is_eof = {
                        let channel_guard = channel_for_reader.lock();
                        channel_guard.0.eof()
                    };

                    if is_eof {
                        println!("[SSH] Connection closed for {}", session_id_read);
                        let _ = app.emit(
                            "ssh-status",
                            SshConnectionStatus {
                                session_id: session_id_read.clone(),
                                status: "disconnected".to_string(),
                                message: "Connection closed by remote host".to_string(),
                            },
                        );
                        break;
                    }
                    thread::sleep(Duration::from_millis(10));
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();

                    // Write to any active log files for this session
                    write_to_logs(&session_id_read, &data);

                    let _ = app.emit(
                        "ssh-output",
                        SshOutput {
                            session_id: session_id_read.clone(),
                            data,
                        },
                    );
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(10));
                }
                Err(e) => {
                    // Check if it's just a temporary error
                    if e.kind() == std::io::ErrorKind::Interrupted {
                        continue;
                    }

                    eprintln!("[SSH] Read error for {}: {}", session_id_read, e);
                    let _ = app.emit(
                        "ssh-status",
                        SshConnectionStatus {
                            session_id: session_id_read.clone(),
                            status: "error".to_string(),
                            message: format!("Connection error: {}", e),
                        },
                    );
                    break;
                }
            }
        }

        // Clean up session
        cleanup_session_logs(&session_id_read);
        let mut sessions = sessions_for_cleanup.lock();
        if let Some(_removed) = sessions.remove(&session_id_read) {
            println!(
                "[SSH] Session {} ({}@{}:{}) cleaned up. Remaining: {}",
                session_id_read, username_display, host_display, port,
                sessions.len()
            );
        }
    });

    println!("[SSH] connect_ssh returning id: {}", session_id);
    Ok(session_id)
}

/// Writes data to an SSH session
#[tauri::command]
pub fn write_ssh(session_id: String, data: String) -> Result<(), String> {
    let sessions_ptr = SSH_SESSIONS.clone();
    let sessions = sessions_ptr.lock();

    if let Some(session) = sessions.get(&session_id) {
        let mut channel = session.channel.lock();
        channel
            .0
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to SSH: {}", e))?;
        channel
            .0
            .flush()
            .map_err(|e| format!("Failed to flush SSH: {}", e))?;
        Ok(())
    } else {
        Err(format!("SSH session not found: {}", session_id))
    }
}

/// Resizes an SSH session's PTY
#[tauri::command]
pub fn resize_ssh(session_id: String, cols: u32, rows: u32) -> Result<(), String> {
    println!(
        "[SSH] resize_ssh called: session_id={}, cols={}, rows={}",
        session_id, cols, rows
    );

    // Note: ssh2 crate doesn't support PTY resize after shell is started
    // This is a limitation of libssh2. The window size was set at PTY request time.
    // For full resize support, consider using russh crate instead.
    
    Ok(())
}

/// Disconnects an SSH session
#[tauri::command]
pub fn disconnect_ssh(session_id: String) -> Result<(), String> {
    println!("[SSH] disconnect_ssh called: session_id={}", session_id);

    let sessions_ptr = SSH_SESSIONS.clone();
    let mut sessions = sessions_ptr.lock();

    if let Some(session) = sessions.remove(&session_id) {
        // Signal reader thread to stop
        *session.running.lock() = false;

        // Close the channel gracefully
        {
            let mut channel = session.channel.lock();
            let _ = channel.0.send_eof();
            let _ = channel.0.wait_close();
        }

        // Clean up logs
        cleanup_session_logs(&session_id);

        println!(
            "[SSH] Session {} disconnected. Remaining: {}",
            session_id,
            sessions.len()
        );
        Ok(())
    } else {
        Err(format!("SSH session not found: {}", session_id))
    }
}

/// Lists active SSH sessions
#[tauri::command]
pub fn list_ssh_sessions() -> Vec<SshSessionInfo> {
    let sessions_ptr = SSH_SESSIONS.clone();
    let sessions = sessions_ptr.lock();

    sessions
        .iter()
        .map(|(id, session)| SshSessionInfo {
            session_id: id.clone(),
            host: session.host.clone(),
            port: session.port,
            username: session.username.clone(),
        })
        .collect()
}

/// Information about an active SSH session (for frontend display)
#[derive(Clone, Serialize, Deserialize)]
pub struct SshSessionInfo {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
}
