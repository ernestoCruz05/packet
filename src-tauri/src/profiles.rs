/**
 * Connection Profiles Module
 * 
 * Manages saved connection profiles for quick access to frequently used servers.
 * Profiles are stored in JSON format in the app's config directory.
 */

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

/// Connection type for a profile
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProfileConnectionType {
    Ssh,
    Telnet,
}

/// SSH authentication method for profiles
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProfileAuthMethod {
    Password,
    PublicKey,
}

/// A saved connection profile
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionProfile {
    pub id: String,
    pub name: String,
    pub connection_type: ProfileConnectionType,
    pub host: String,
    pub port: u16,
    // SSH-specific fields
    pub username: Option<String>,
    pub auth_method: Option<ProfileAuthMethod>,
    pub key_path: Option<String>,
    // Don't store passwords for security - user must enter each time
    pub created_at: String,
    pub updated_at: String,
}

/// Profile store state
pub struct ProfileStore {
    profiles: Mutex<HashMap<String, ConnectionProfile>>,
    config_path: PathBuf,
}

impl ProfileStore {
    pub fn new() -> Self {
        let config_path = get_config_path();
        let profiles = load_profiles(&config_path);
        
        ProfileStore {
            profiles: Mutex::new(profiles),
            config_path,
        }
    }
    
    fn save(&self) -> Result<(), String> {
        let profiles = self.profiles.lock().map_err(|e| e.to_string())?;
        let json = serde_json::to_string_pretty(&*profiles)
            .map_err(|e| format!("Failed to serialize profiles: {}", e))?;
        
        // Ensure parent directory exists
        if let Some(parent) = self.config_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }
        
        fs::write(&self.config_path, json)
            .map_err(|e| format!("Failed to write profiles: {}", e))?;
        
        Ok(())
    }
}

/// Get the config file path
fn get_config_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("packet")
        .join("profiles.json")
}

/// Load profiles from disk
fn load_profiles(path: &PathBuf) -> HashMap<String, ConnectionProfile> {
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(profiles) = serde_json::from_str(&content) {
            return profiles;
        }
    }
    HashMap::new()
}

/// Get current timestamp
fn now_timestamp() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Create a new connection profile
#[tauri::command]
pub fn create_profile(
    store: State<ProfileStore>,
    name: String,
    connection_type: String,
    host: String,
    port: u16,
    username: Option<String>,
    auth_method: Option<String>,
    key_path: Option<String>,
) -> Result<ConnectionProfile, String> {
    let conn_type = match connection_type.to_lowercase().as_str() {
        "ssh" => ProfileConnectionType::Ssh,
        "telnet" => ProfileConnectionType::Telnet,
        _ => return Err("Invalid connection type".to_string()),
    };
    
    let auth = auth_method.map(|m| match m.to_lowercase().as_str() {
        "publickey" => ProfileAuthMethod::PublicKey,
        _ => ProfileAuthMethod::Password,
    });
    
    let now = now_timestamp();
    let profile = ConnectionProfile {
        id: Uuid::new_v4().to_string(),
        name,
        connection_type: conn_type,
        host,
        port,
        username,
        auth_method: auth,
        key_path,
        created_at: now.clone(),
        updated_at: now,
    };
    
    let mut profiles = store.profiles.lock().map_err(|e| e.to_string())?;
    profiles.insert(profile.id.clone(), profile.clone());
    drop(profiles);
    
    store.save()?;
    
    Ok(profile)
}

/// Update an existing profile
#[tauri::command]
pub fn update_profile(
    store: State<ProfileStore>,
    id: String,
    name: String,
    connection_type: String,
    host: String,
    port: u16,
    username: Option<String>,
    auth_method: Option<String>,
    key_path: Option<String>,
) -> Result<ConnectionProfile, String> {
    let conn_type = match connection_type.to_lowercase().as_str() {
        "ssh" => ProfileConnectionType::Ssh,
        "telnet" => ProfileConnectionType::Telnet,
        _ => return Err("Invalid connection type".to_string()),
    };
    
    let auth = auth_method.map(|m| match m.to_lowercase().as_str() {
        "publickey" => ProfileAuthMethod::PublicKey,
        _ => ProfileAuthMethod::Password,
    });
    
    let mut profiles = store.profiles.lock().map_err(|e| e.to_string())?;
    
    let existing = profiles.get(&id).ok_or("Profile not found")?;
    let profile = ConnectionProfile {
        id: id.clone(),
        name,
        connection_type: conn_type,
        host,
        port,
        username,
        auth_method: auth,
        key_path,
        created_at: existing.created_at.clone(),
        updated_at: now_timestamp(),
    };
    
    profiles.insert(id, profile.clone());
    drop(profiles);
    
    store.save()?;
    
    Ok(profile)
}

/// Delete a profile
#[tauri::command]
pub fn delete_profile(
    store: State<ProfileStore>,
    id: String,
) -> Result<bool, String> {
    let mut profiles = store.profiles.lock().map_err(|e| e.to_string())?;
    let removed = profiles.remove(&id).is_some();
    drop(profiles);
    
    if removed {
        store.save()?;
    }
    
    Ok(removed)
}

/// List all profiles
#[tauri::command]
pub fn list_profiles(
    store: State<ProfileStore>,
) -> Result<Vec<ConnectionProfile>, String> {
    let profiles = store.profiles.lock().map_err(|e| e.to_string())?;
    let mut list: Vec<ConnectionProfile> = profiles.values().cloned().collect();
    list.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(list)
}

/// Get a single profile by ID
#[tauri::command]
pub fn get_profile(
    store: State<ProfileStore>,
    id: String,
) -> Result<Option<ConnectionProfile>, String> {
    let profiles = store.profiles.lock().map_err(|e| e.to_string())?;
    Ok(profiles.get(&id).cloned())
}
