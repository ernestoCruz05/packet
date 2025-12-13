//! Telnet Connection Module for GNS3
//!
//! This module handles telnet connections to GNS3 network devices.
//! GNS3 exposes router/switch console ports via telnet, typically
//! on localhost with dynamic port numbers (e.g., localhost:5000).
//!
//! # Architecture
//!
//! Each telnet session maintains:
//! - A TCP connection to the GNS3 device
//! - A reader thread that emits output events to the frontend
//! - A writer for sending commands to the device

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

/// Buffer size for reading telnet output (4KB)
const TELNET_READ_BUFFER_SIZE: usize = 4096;

/// Connection timeout in seconds
const CONNECTION_TIMEOUT_SECS: u64 = 10;

/// Represents an active telnet session
pub struct TelnetSession {
    /// The TCP stream writer (wrapped for thread-safe access)
    pub writer: Arc<Mutex<TcpStream>>,
    /// Connection info for display
    pub host: String,
    pub port: u16,
    /// Flag to signal reader thread to stop
    pub running: Arc<Mutex<bool>>,
}

/// Global static state for all telnet sessions
static TELNET_SESSIONS: Lazy<Arc<Mutex<HashMap<String, TelnetSession>>>> = Lazy::new(|| {
    println!("[Telnet] Initializing global telnet session store");
    Arc::new(Mutex::new(HashMap::new()))
});

/// Event payload emitted when telnet output is available
#[derive(Clone, Serialize, Deserialize)]
pub struct TelnetOutput {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub data: String,
}

/// Event payload for connection status updates
#[derive(Clone, Serialize, Deserialize)]
pub struct ConnectionStatus {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub status: String,
    pub message: String,
}
/// Establishes a new telnet connection to a GNS3 device
#[tauri::command]
pub fn connect_telnet(
    app: AppHandle,
    host: String,
    port: u16,
) -> Result<String, String> {
    println!("[Telnet] Connecting to {}:{}", host, port);

    let sessions_ptr = TELNET_SESSIONS.clone();

    // Resolve hostname to socket address
    let addr_str = format!("{}:{}", host, port);
    let socket_addr = addr_str
        .to_socket_addrs()
        .map_err(|e| format!("Failed to resolve address '{}': {}", addr_str, e))?
        .next()
        .ok_or_else(|| format!("No addresses found for '{}'", addr_str))?;

    println!("[Telnet] Resolved to: {}", socket_addr);

    // Attempt TCP connection with timeout
    let stream = TcpStream::connect_timeout(
        &socket_addr,
        Duration::from_secs(CONNECTION_TIMEOUT_SECS),
    )
    .map_err(|e| format!("Connection failed: {}", e))?;

    // Configure the stream
    stream
        .set_read_timeout(Some(Duration::from_millis(100)))
        .map_err(|e| format!("Failed to set read timeout: {}", e))?;
    stream
        .set_nodelay(true)
        .map_err(|e| format!("Failed to set nodelay: {}", e))?;

    // Clone stream for reader thread
    let reader_stream = stream
        .try_clone()
        .map_err(|e| format!("Failed to clone stream: {}", e))?;

    // Generate session ID
    let session_id = Uuid::new_v4().to_string();
    println!("[Telnet] Generated session ID: {}", session_id);

    let running = Arc::new(Mutex::new(true));
    let running_clone = running.clone();

    // Store session
    {
        let mut sessions = sessions_ptr.lock();
        sessions.insert(
            session_id.clone(),
            TelnetSession {
                writer: Arc::new(Mutex::new(stream)),
                host: host.clone(),
                port,
                running,
            },
        );
        println!(
            "[Telnet] Session {} stored. Total sessions: {}",
            session_id,
            sessions.len()
        );
    }

    // Emit connection success
    let _ = app.emit(
        "telnet-status",
        ConnectionStatus {
            session_id: session_id.clone(),
            status: "connected".to_string(),
            message: format!("Connected to {}:{}", host, port),
        },
    );

    // Spawn reader thread
    let session_id_clone = session_id.clone();
    let sessions_for_cleanup = sessions_ptr.clone();

    thread::spawn(move || {
        println!("[Telnet] Reader thread started for {}", session_id_clone);
        let mut reader = reader_stream;
        let mut buf = [0u8; TELNET_READ_BUFFER_SIZE];

        loop {
            // Check if we should stop
            if !*running_clone.lock() {
                println!("[Telnet] Reader thread stopping for {}", session_id_clone);
                break;
            }

            match reader.read(&mut buf) {
                Ok(0) => {
                    println!("[Telnet] Connection closed for {}", session_id_clone);
                    let _ = app.emit(
                        "telnet-status",
                        ConnectionStatus {
                            session_id: session_id_clone.clone(),
                            status: "disconnected".to_string(),
                            message: "Connection closed by remote host".to_string(),
                        },
                    );
                    break;
                }
                Ok(n) => {
                    // Process telnet protocol bytes and extract printable data
                    let data = process_telnet_data(&buf[..n]);
                    if !data.is_empty() {
                        let _ = app.emit(
                            "telnet-output",
                            TelnetOutput {
                                session_id: session_id_clone.clone(),
                                data,
                            },
                        );
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    // No data available, continue loop
                    thread::sleep(Duration::from_millis(10));
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    // Read timeout, continue loop
                    continue;
                }
                Err(e) => {
                    eprintln!("[Telnet] Read error for {}: {}", session_id_clone, e);
                    let _ = app.emit(
                        "telnet-status",
                        ConnectionStatus {
                            session_id: session_id_clone.clone(),
                            status: "error".to_string(),
                            message: format!("Read error: {}", e),
                        },
                    );
                    break;
                }
            }
        }

        // Clean up session
        let mut sessions = sessions_for_cleanup.lock();
        sessions.remove(&session_id_clone);
        println!(
            "[Telnet] Session {} cleaned up. Remaining: {}",
            session_id_clone,
            sessions.len()
        );
    });

    println!("[Telnet] connect_telnet returning id: {}", session_id);
    Ok(session_id)
}

/// Writes data to a telnet session
#[tauri::command]
pub fn write_telnet(session_id: String, data: String) -> Result<(), String> {
    println!(
        "[Telnet] write_telnet called: session_id={}, data_len={}",
        session_id,
        data.len()
    );

    let sessions_ptr = TELNET_SESSIONS.clone();
    let sessions = sessions_ptr.lock();

    if let Some(session) = sessions.get(&session_id) {
        let mut writer = session.writer.lock();
        writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write: {}", e))?;
        writer
            .flush()
            .map_err(|e| format!("Failed to flush: {}", e))?;
        println!("[Telnet] Write successful to {}", session_id);
        Ok(())
    } else {
        let err = format!("Telnet session not found: {}", session_id);
        eprintln!("[Telnet] {}", err);
        Err(err)
    }
}

/// Disconnects a telnet session
#[tauri::command]
pub fn disconnect_telnet(session_id: String) -> Result<(), String> {
    println!("[Telnet] disconnect_telnet called: session_id={}", session_id);

    let sessions_ptr = TELNET_SESSIONS.clone();
    let mut sessions = sessions_ptr.lock();

    if let Some(session) = sessions.remove(&session_id) {
        // Signal reader thread to stop
        *session.running.lock() = false;
        // Close the connection
        drop(session.writer);
        println!(
            "[Telnet] Session {} disconnected. Remaining: {}",
            session_id,
            sessions.len()
        );
        Ok(())
    } else {
        Err(format!("Telnet session not found: {}", session_id))
    }
}

/// Process raw telnet data, handling telnet protocol commands
/// 
/// Telnet protocol uses bytes 255 (IAC) followed by command bytes.
/// We filter these out and return only printable data.
fn process_telnet_data(raw: &[u8]) -> String {
    let mut result = Vec::with_capacity(raw.len());
    let mut i = 0;

    while i < raw.len() {
        let byte = raw[i];

        // IAC (Interpret As Command) - telnet protocol escape
        if byte == 255 && i + 1 < raw.len() {
            let cmd = raw[i + 1];
            match cmd {
                // IAC IAC = literal 255
                255 => {
                    result.push(255);
                    i += 2;
                }
                // WILL, WONT, DO, DONT - 3 byte sequences
                251..=254 => {
                    // Skip the 3-byte telnet negotiation
                    i += 3;
                }
                // SB (subnegotiation) - skip until SE
                250 => {
                    // Find the end of subnegotiation (IAC SE = 255 240)
                    while i < raw.len() {
                        if raw[i] == 255 && i + 1 < raw.len() && raw[i + 1] == 240 {
                            i += 2;
                            break;
                        }
                        i += 1;
                    }
                }
                // Other commands - 2 byte sequences
                _ => {
                    i += 2;
                }
            }
        } else {
            // Regular data byte
            result.push(byte);
            i += 1;
        }
    }

    String::from_utf8_lossy(&result).to_string()
}

/// Get list of active telnet sessions
#[tauri::command]
pub fn list_telnet_sessions() -> Vec<(String, String, u16)> {
    let sessions_ptr = TELNET_SESSIONS.clone();
    let sessions = sessions_ptr.lock();

    sessions
        .iter()
        .map(|(id, session)| (id.clone(), session.host.clone(), session.port))
        .collect()
}
