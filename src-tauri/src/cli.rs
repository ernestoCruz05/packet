//! CLI Argument Parsing for GNS3 Integration
//!
//! This module handles command-line arguments to allow GNS3 (and other tools)
//! to launch Packet with pre-configured telnet connections.
//!
//! # GNS3 Console Application Command
//!
//! In GNS3 → Edit → Preferences → Console applications, set:
//! ```
//! packet --name "{name}" --host {host} --port {port}
//! ```
//!
//! This will launch Packet and automatically connect to the device.

use clap::Parser;
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};

/// Global storage for CLI arguments (accessible from Tauri commands)
pub static CLI_ARGS: OnceCell<Option<ConnectionArgs>> = OnceCell::new();

/// Command-line arguments for Packet
#[derive(Parser, Debug, Clone)]
#[command(name = "packet")]
#[command(author = "Packet Team")]
#[command(version = "0.1.0")]
#[command(about = "Terminal broadcast system for GNS3 and network devices")]
#[command(long_about = None)]
pub struct Args {
    /// Device name (displayed in tab)
    #[arg(short = 'T', long = "name", alias = "title")]
    pub name: Option<String>,

    /// Telnet host to connect to
    #[arg(long = "host")]
    pub host: Option<String>,

    /// Telnet port to connect to
    #[arg(short, long = "port")]
    pub port: Option<u16>,

    /// Legacy xfce4-terminal compatible: -e "telnet host port"
    #[arg(short = 'e', long = "execute")]
    pub execute: Option<String>,
}

/// Parsed connection arguments to send to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionArgs {
    pub name: String,
    pub host: String,
    pub port: u16,
}

impl Args {
    /// Parse CLI arguments and extract connection info
    pub fn parse_connection(&self) -> Option<ConnectionArgs> {
        // Try direct --host --port first
        if let (Some(host), Some(port)) = (&self.host, self.port) {
            return Some(ConnectionArgs {
                name: self.name.clone().unwrap_or_else(|| format!("{}:{}", host, port)),
                host: host.clone(),
                port,
            });
        }

        // Try parsing -e "telnet host port" format (xfce4-terminal compatible)
        if let Some(execute) = &self.execute {
            if let Some(conn) = Self::parse_execute_command(execute, self.name.clone()) {
                return Some(conn);
            }
        }

        None
    }

    /// Parse xfce4-terminal style execute command: "telnet host port"
    fn parse_execute_command(cmd: &str, name: Option<String>) -> Option<ConnectionArgs> {
        let parts: Vec<&str> = cmd.split_whitespace().collect();
        
        // Expected format: "telnet host port" or just "host port"
        if parts.len() >= 3 && parts[0].to_lowercase() == "telnet" {
            let host = parts[1].to_string();
            if let Ok(port) = parts[2].parse::<u16>() {
                return Some(ConnectionArgs {
                    name: name.unwrap_or_else(|| format!("{}:{}", host, port)),
                    host,
                    port,
                });
            }
        } else if parts.len() >= 2 {
            // Try "host port" format
            let host = parts[0].to_string();
            if let Ok(port) = parts[1].parse::<u16>() {
                return Some(ConnectionArgs {
                    name: name.unwrap_or_else(|| format!("{}:{}", host, port)),
                    host,
                    port,
                });
            }
        }

        None
    }
}

/// Initialize CLI argument parsing and store in global state
pub fn init_cli() -> Option<ConnectionArgs> {
    let args = Args::parse();
    let connection = args.parse_connection();
    
    if let Some(ref conn) = connection {
        println!("[CLI] Connection request: {} -> {}:{}", conn.name, conn.host, conn.port);
    }
    
    // Store in global for later access
    let _ = CLI_ARGS.set(connection.clone());
    
    connection
}

/// Parse connection args from a vector of strings (for single-instance callback)
/// This is used when a second instance tries to start and sends its args to the first instance
pub fn parse_args_to_connection(args: &[String]) -> Option<ConnectionArgs> {
    // Skip the first arg (program name) and parse the rest
    // We need to manually parse since clap::Parser needs the full args
    let mut name: Option<String> = None;
    let mut host: Option<String> = None;
    let mut port: Option<u16> = None;
    let mut execute: Option<String> = None;
    
    let mut iter = args.iter().skip(1).peekable(); // Skip program name
    
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--name" | "-T" | "--title" => {
                name = iter.next().cloned();
            }
            "--host" => {
                host = iter.next().cloned();
            }
            "--port" | "-p" => {
                port = iter.next().and_then(|s| s.parse().ok());
            }
            "-e" | "--execute" => {
                execute = iter.next().cloned();
            }
            other => {
                // Handle --name=value style
                if let Some(val) = other.strip_prefix("--name=") {
                    name = Some(val.to_string());
                } else if let Some(val) = other.strip_prefix("--host=") {
                    host = Some(val.to_string());
                } else if let Some(val) = other.strip_prefix("--port=") {
                    port = val.parse().ok();
                }
            }
        }
    }
    
    // Try direct --host --port first
    if let (Some(h), Some(p)) = (&host, port) {
        return Some(ConnectionArgs {
            name: name.unwrap_or_else(|| format!("{}:{}", h, p)),
            host: h.clone(),
            port: p,
        });
    }
    
    // Try parsing -e "telnet host port" format
    if let Some(exec) = execute {
        return Args::parse_execute_command(&exec, name);
    }
    
    None
}

/// Tauri command to get CLI connection arguments (called by frontend on startup)
#[tauri::command]
pub fn get_cli_connection() -> Option<ConnectionArgs> {
    CLI_ARGS.get().cloned().flatten()
}
