// Jarvis Tauri entrypoint.
//
// Wires the SQLite-backed Db into Tauri state and registers all invoke
// commands. The data directory follows the macOS convention:
//   ~/Library/Application Support/app.jarvis/
// MCP server defaults to the same path so both processes share state.

mod claude;
mod commands;
mod config;
mod db;
mod error;
mod images;
mod index_writer;
mod markdown;
mod models;

use db::Db;
use index_writer::write_index;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("could not resolve app data dir");
            let db = Db::open(&data_dir).expect("failed to open Jarvis database");
            // Write index once at startup so the MCP server has fresh state
            // even if the app hasn't been mutated this session.
            let _ = write_index(&db);
            app.manage(db);

            // ── Global hotkey: Cmd+Shift+N → show window + open QuickAdd ──
            let shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyN);
            app.global_shortcut().on_shortcut(shortcut, |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.set_focus();
                        let _ = w.emit("global-quick-add", ());
                    }
                }
            })?;

            Ok(())
        })
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::list_nodes,
            commands::get_node,
            commands::create_node,
            commands::update_node,
            commands::delete_node,
            commands::list_edges,
            commands::add_edge,
            commands::remove_edge,
            commands::list_tags,
            commands::upsert_tag,
            commands::search_nodes,
            commands::list_session_log,
            commands::append_session_log,
            commands::save_image,
            commands::data_dir,
            commands::index_mtime,
            commands::get_config,
            commands::set_config,
            commands::call_claude_api,
            commands::fetch_url,
            commands::list_daily_logs,
            commands::append_daily_log,
            commands::export_vault_cmd,
            commands::export_node_markdown,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Jarvis");
}
