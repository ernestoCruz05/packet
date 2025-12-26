//! Session Logging Module for Packet
//!
//! This module provides command-based logging functionality for terminal sessions.
//! Users can start/stop logging via commands:
//! - `:l <filename>` - Start logging to a file
//! - `:el <filename>` - End logging to a specific file
//!
//! Multiple log files can be active simultaneously per session.
//! All terminal output (PTY/telnet/SSH) is written to active log files.
//!
//! # Architecture
//!
//! Each session can have multiple active log files. The logging system:
//! - Maintains a HashMap of session_id -> Vec<ActiveLogFile>
//! - Each log file tracks its path, file handle, and start timestamp
//! - Output is appended in real-time as data flows through the terminal

use chrono::{Local, DateTime};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;

/// Represents an active log file for a session
pub struct ActiveLogFile {
    /// The file path (for identification)
    pub path: PathBuf,
    /// The file handle for writing
    pub file: File,
    /// When logging started
    pub started_at: DateTime<Local>,
}

/// Global state for all active logging sessions
/// Maps session_id -> Vec<ActiveLogFile>
static LOG_SESSIONS: Lazy<Arc<Mutex<HashMap<String, Vec<ActiveLogFile>>>>> = Lazy::new(|| {
    println!("[Logging] Initializing global logging session store");
    Arc::new(Mutex::new(HashMap::new()))
});

/// Information about an active log file (for frontend display)
#[derive(Clone, Serialize, Deserialize)]
pub struct LogFileInfo {
    pub path: String,
    #[serde(rename = "startedAt")]
    pub started_at: String,
}

/// Result of a logging operation
#[derive(Clone, Serialize, Deserialize)]
pub struct LoggingResult {
    pub success: bool,
    pub message: String,
}

/// Starts logging terminal output to a file.
/// 
/// # Arguments
/// * `session_id` - The terminal session ID (PTY ID, telnet session ID, or SSH session ID)
/// * `filename` - The filename to log to (will be created in user's home directory or as absolute path)
/// 
/// # Returns
/// Result with success status and message
#[tauri::command]
pub fn start_logging(session_id: String, filename: String) -> Result<LoggingResult, String> {
    println!("[Logging] start_logging called: session_id={}, filename={}", session_id, filename);
    
    let log_sessions = LOG_SESSIONS.clone();
    let mut sessions = log_sessions.lock();
    
    // Resolve the file path
    let path = resolve_log_path(&filename)?;
    
    // Check if this file is already being logged for this session
    if let Some(log_files) = sessions.get(&session_id) {
        if log_files.iter().any(|lf| lf.path == path) {
            return Ok(LoggingResult {
                success: false,
                message: format!("Already logging to '{}'", filename),
            });
        }
    }
    
    // Open or create the file for appending
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open log file '{}': {}", path.display(), e))?;
    
    let started_at = Local::now();
    
    // Write a header to the log file
    let mut file_clone = file.try_clone()
        .map_err(|e| format!("Failed to clone file handle: {}", e))?;
    
    writeln!(
        file_clone,
        "\n=== Packet Logging Started: {} ===\n",
        started_at.format("%Y-%m-%d %H:%M:%S")
    ).map_err(|e| format!("Failed to write log header: {}", e))?;
    
    // Create the active log file entry
    let active_log = ActiveLogFile {
        path: path.clone(),
        file,
        started_at,
    };
    
    // Add to the session's log files
    sessions
        .entry(session_id.clone())
        .or_insert_with(Vec::new)
        .push(active_log);
    
    println!("[Logging] Started logging to '{}' for session {}", path.display(), session_id);
    
    Ok(LoggingResult {
        success: true,
        message: format!("Started logging to '{}'", filename),
    })
}

/// Stops logging to a specific file for a session.
/// 
/// # Arguments
/// * `session_id` - The terminal session ID
/// * `filename` - The filename to stop logging to
/// 
/// # Returns
/// Result with success status and message
#[tauri::command]
pub fn stop_logging(session_id: String, filename: String) -> Result<LoggingResult, String> {
    println!("[Logging] stop_logging called: session_id={}, filename={}", session_id, filename);
    
    let log_sessions = LOG_SESSIONS.clone();
    let mut sessions = log_sessions.lock();
    
    let path = resolve_log_path(&filename)?;
    
    if let Some(log_files) = sessions.get_mut(&session_id) {
        // Find and remove the log file entry
        let original_len = log_files.len();
        
        // Find the index of the file to remove
        if let Some(idx) = log_files.iter().position(|lf| lf.path == path) {
            let mut removed = log_files.remove(idx);
            
            // Write a footer to the log file before closing
            let ended_at = Local::now();
            let _ = writeln!(
                removed.file,
                "\n=== Packet Logging Ended: {} ===\n",
                ended_at.format("%Y-%m-%d %H:%M:%S")
            );
            
            // File handle is dropped here, closing the file
            
            // If no more log files for this session, remove the session entry
            if log_files.is_empty() {
                sessions.remove(&session_id);
            }
            
            println!("[Logging] Stopped logging to '{}' for session {}", path.display(), session_id);
            
            return Ok(LoggingResult {
                success: true,
                message: format!("Stopped logging to '{}'", filename),
            });
        }
        
        if log_files.len() == original_len {
            return Ok(LoggingResult {
                success: false,
                message: format!("Not currently logging to '{}'", filename),
            });
        }
    }
    
    Ok(LoggingResult {
        success: false,
        message: format!("No active logs for this session"),
    })
}

/// Lists all active log files for a session.
/// 
/// # Arguments
/// * `session_id` - The terminal session ID
/// 
/// # Returns
/// List of active log file information
#[tauri::command]
pub fn list_session_logs(session_id: String) -> Vec<LogFileInfo> {
    let log_sessions = LOG_SESSIONS.clone();
    let sessions = log_sessions.lock();
    
    sessions
        .get(&session_id)
        .map(|log_files| {
            log_files
                .iter()
                .map(|lf| LogFileInfo {
                    path: lf.path.to_string_lossy().to_string(),
                    started_at: lf.started_at.format("%Y-%m-%d %H:%M:%S").to_string(),
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Writes data to all active log files for a session.
/// This is called internally when terminal output is received.
/// 
/// # Arguments
/// * `session_id` - The terminal session ID
/// * `data` - The data to log
pub fn write_to_logs(session_id: &str, data: &str) {
    let log_sessions = LOG_SESSIONS.clone();
    let mut sessions = log_sessions.lock();
    
    if let Some(log_files) = sessions.get_mut(session_id) {
        for log_file in log_files.iter_mut() {
            // Strip ANSI escape codes for cleaner logs
            let clean_data = strip_ansi_codes(data);
            if let Err(e) = log_file.file.write_all(clean_data.as_bytes()) {
                eprintln!("[Logging] Failed to write to '{}': {}", log_file.path.display(), e);
            }
            // Flush to ensure data is written immediately
            let _ = log_file.file.flush();
        }
    }
}

/// Cleans up all log files for a session (called when session is closed).
pub fn cleanup_session_logs(session_id: &str) {
    let log_sessions = LOG_SESSIONS.clone();
    let mut sessions = log_sessions.lock();
    
    if let Some(mut log_files) = sessions.remove(session_id) {
        let ended_at = Local::now();
        for log_file in log_files.iter_mut() {
            let _ = writeln!(
                log_file.file,
                "\n=== Packet Logging Ended (Session Closed): {} ===\n",
                ended_at.format("%Y-%m-%d %H:%M:%S")
            );
        }
        println!("[Logging] Cleaned up {} log files for session {}", log_files.len(), session_id);
    }
}

/// Resolves a filename to a full path.
/// If the filename is absolute, use it as-is.
/// Otherwise, use the user's home directory or current directory.
fn resolve_log_path(filename: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(filename);
    
    if path.is_absolute() {
        return Ok(path);
    }
    
    // Use home directory or current directory
    let base_dir = dirs::home_dir()
        .or_else(|| std::env::current_dir().ok())
        .ok_or_else(|| "Cannot determine log directory".to_string())?;
    
    // Create a "packet-logs" subdirectory
    let log_dir = base_dir.join("packet-logs");
    std::fs::create_dir_all(&log_dir)
        .map_err(|e| format!("Failed to create log directory: {}", e))?;
    
    Ok(log_dir.join(filename))
}

/// Strips ANSI escape codes from text for cleaner log files.
fn strip_ansi_codes(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            // Skip ANSI escape sequence
            if chars.peek() == Some(&'[') {
                chars.next(); // consume '['
                // Skip until we hit a letter (end of sequence)
                while let Some(&next) = chars.peek() {
                    chars.next();
                    if next.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
        } else {
            result.push(c);
        }
    }
    
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_strip_ansi_codes() {
        let input = "\x1b[31mRed Text\x1b[0m Normal";
        let output = strip_ansi_codes(input);
        assert_eq!(output, "Red Text Normal");
    }
    
    #[test]
    fn test_strip_ansi_complex() {
        let input = "\x1b[38;5;196mBright Red\x1b[0m";
        let output = strip_ansi_codes(input);
        assert_eq!(output, "Bright Red");
    }
}
