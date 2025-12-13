//! PTY (Pseudo-Terminal) Management Module
//!
//! This module handles the creation, management, and cleanup of PTY sessions
//! for the Packet terminal broadcast application.

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

/// Buffer size for reading PTY output (8KB)
const PTY_READ_BUFFER_SIZE: usize = 8192;

/// Represents an active PTY session with its associated handles.
pub struct PtySession {
    /// Master PTY handle for resize and control operations
    pub master: Box<dyn MasterPty + Send>,
    /// Writer handle for sending input to the PTY
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
}

/// Global static state for all PTY sessions.
/// Using Lazy + Mutex ensures thread-safe access across all Tauri commands.
static PTY_SESSIONS: Lazy<Arc<Mutex<HashMap<String, PtySession>>>> = Lazy::new(|| {
    println!("[PTY] Initializing global PTY session store");
    Arc::new(Mutex::new(HashMap::new()))
});

/// Event payload emitted when PTY output is available.
#[derive(Clone, Serialize, Deserialize)]
pub struct PtyOutput {
    #[serde(rename = "ptyId")]
    pub pty_id: String,
    pub data: String,
}

/// Spawns a new PTY session with the user's default shell.
#[tauri::command]
pub fn spawn_pty(
    app: AppHandle,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    println!("[PTY] spawn_pty called with cols={}, rows={}", cols, rows);
    
    // Force initialization of the lazy static
    let sessions_ptr = PTY_SESSIONS.clone();
    println!("[PTY] Got sessions reference: {:p}", Arc::as_ptr(&sessions_ptr));
    
    let pty_system = native_pty_system();

    // Open a new PTY pair (master + slave)
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    // Determine the user's shell (fallback to bash)
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    println!("[PTY] Using shell: {}", shell);

    // Configure the shell command with proper terminal settings
    let mut cmd = CommandBuilder::new(&shell);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    // Spawn the shell process attached to the slave PTY
    let _child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    // Generate unique identifier for this session
    let pty_id = Uuid::new_v4().to_string();
    println!("[PTY] Generated PTY ID: {}", pty_id);

    // Clone the reader for the background thread
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;

    // Take ownership of the writer
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take writer: {}", e))?;

    // Store the session in global state
    {
        let mut sessions = sessions_ptr.lock();
        sessions.insert(
            pty_id.clone(),
            PtySession {
                master: pair.master,
                writer: Arc::new(Mutex::new(writer)),
            },
        );
        println!("[PTY] Session {} stored. Total sessions: {}", pty_id, sessions.len());
        println!("[PTY] Session IDs: {:?}", sessions.keys().collect::<Vec<_>>());
    }

    // Spawn background thread to read PTY output and emit events
    let pty_id_clone = pty_id.clone();
    let sessions_for_cleanup = sessions_ptr.clone();

    thread::spawn(move || {
        println!("[PTY] Reader thread started for {}", pty_id_clone);
        let mut buf = [0u8; PTY_READ_BUFFER_SIZE];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    println!("[PTY] EOF for {}", pty_id_clone);
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app.emit(
                        "pty-output",
                        PtyOutput {
                            pty_id: pty_id_clone.clone(),
                            data,
                        },
                    );
                }
                Err(e) => {
                    eprintln!("[PTY] Read error for {}: {}", pty_id_clone, e);
                    break;
                }
            }
        }
        
        // Clean up session when reader exits
        let mut sessions = sessions_for_cleanup.lock();
        sessions.remove(&pty_id_clone);
        println!("[PTY] Session {} cleaned up. Remaining: {}", pty_id_clone, sessions.len());
    });

    println!("[PTY] spawn_pty returning id: {}", pty_id);
    Ok(pty_id)
}

/// Writes input data to a PTY session.
#[tauri::command]
pub fn write_to_pty(pty_id: String, data: String) -> Result<(), String> {
    println!("[PTY] write_to_pty called: pty_id={}, data_len={}", pty_id, data.len());
    
    let sessions_ptr = PTY_SESSIONS.clone();
    println!("[PTY] Got sessions reference: {:p}", Arc::as_ptr(&sessions_ptr));
    
    let sessions = sessions_ptr.lock();
    println!("[PTY] Current sessions: {:?}", sessions.keys().collect::<Vec<_>>());

    if let Some(session) = sessions.get(&pty_id) {
        let mut writer = session.writer.lock();
        writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;
        writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;
        println!("[PTY] Write successful to {}", pty_id);
        Ok(())
    } else {
        let err = format!("PTY session not found: {}", pty_id);
        eprintln!("[PTY] {}", err);
        Err(err)
    }
}

/// Resizes a PTY session to new dimensions.
#[tauri::command]
pub fn resize_pty(pty_id: String, cols: u16, rows: u16) -> Result<(), String> {
    println!("[PTY] resize_pty called: pty_id={}, cols={}, rows={}", pty_id, cols, rows);
    
    let sessions_ptr = PTY_SESSIONS.clone();
    let sessions = sessions_ptr.lock();

    if let Some(session) = sessions.get(&pty_id) {
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize PTY: {}", e))?;
        println!("[PTY] Resize successful for {}", pty_id);
        Ok(())
    } else {
        Err(format!("PTY session not found: {}", pty_id))
    }
}

/// Terminates and cleans up a PTY session.
#[tauri::command]
pub fn kill_pty(pty_id: String) -> Result<(), String> {
    println!("[PTY] kill_pty called: pty_id={}", pty_id);
    
    let sessions_ptr = PTY_SESSIONS.clone();
    let mut sessions = sessions_ptr.lock();

    if sessions.remove(&pty_id).is_some() {
        println!("[PTY] Session {} killed. Remaining: {}", pty_id, sessions.len());
        Ok(())
    } else {
        Err(format!("PTY session not found: {}", pty_id))
    }
}

// Dummy struct to satisfy Tauri's manage() - we don't actually use it
pub struct PtyState;

impl Default for PtyState {
    fn default() -> Self {
        PtyState
    }
}
