use crate::error::AppResult;
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Save raw image bytes to `<data_dir>/images/<uuid>.<ext>` and return
/// the absolute path. Tiptap's PasteImage extension calls this and
/// inserts an `<img>` referencing the returned path via Tauri's
/// `convertFileSrc`.
pub fn save_image_to_dir(data_dir: &Path, bytes: &[u8], ext_hint: Option<&str>) -> AppResult<PathBuf> {
    let images_dir = data_dir.join("images");
    std::fs::create_dir_all(&images_dir)?;
    let ext = ext_hint
        .map(|s| s.trim_start_matches('.').to_ascii_lowercase())
        .filter(|s| matches!(s.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg"))
        .unwrap_or_else(|| sniff_extension(bytes).to_string());
    let path = images_dir.join(format!("{}.{}", Uuid::new_v4(), ext));
    std::fs::write(&path, bytes)?;
    Ok(path)
}

/// Tiny magic-byte sniffer to pick a sensible extension when the
/// frontend doesn't know.
fn sniff_extension(bytes: &[u8]) -> &'static str {
    match bytes {
        b if b.starts_with(&[0x89, b'P', b'N', b'G']) => "png",
        b if b.starts_with(&[0xFF, 0xD8, 0xFF]) => "jpg",
        b if b.starts_with(b"GIF8") => "gif",
        b if b.len() >= 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" => "webp",
        b if b.starts_with(b"<svg") || b.starts_with(b"<?xml") => "svg",
        _ => "png", // safe default
    }
}
