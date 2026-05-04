//! Simple JSON config stored in `<data_dir>/config.json`.
//!
//! Currently holds the Claude API key. Reads/writes are cheap since the
//! file is tiny; no caching needed.

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    #[serde(default)]
    pub claude_api_key: Option<String>,
    #[serde(default)]
    pub auto_log: Option<bool>,
}

fn config_path(data_dir: &Path) -> PathBuf {
    data_dir.join("config.json")
}

pub fn read_config(data_dir: &Path) -> AppResult<Config> {
    let path = config_path(data_dir);
    if !path.exists() {
        return Ok(Config::default());
    }
    let bytes = std::fs::read(&path)?;
    let cfg: Config = serde_json::from_slice(&bytes).map_err(|e| {
        AppError::Invalid(format!("bad config.json: {e}"))
    })?;
    Ok(cfg)
}

pub fn write_config(data_dir: &Path, cfg: &Config) -> AppResult<()> {
    let path = config_path(data_dir);
    let json = serde_json::to_string_pretty(cfg)?;
    std::fs::write(&path, json)?;
    Ok(())
}
