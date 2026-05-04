//! Claude API client — sends a structured prompt and returns the response text.
//!
//! Uses the Messages API (v1) with `claude-sonnet-4-20250514`.
//! The caller is responsible for constructing the system/user messages
//! and parsing the JSON from the response.

use crate::error::{AppError, AppResult};
use reqwest::Client;
use serde::{Deserialize, Serialize};

const API_URL: &str = "https://api.anthropic.com/v1/messages";
const MODEL: &str = "claude-sonnet-4-20250514";
const MAX_TOKENS: u32 = 4096;

#[derive(Serialize)]
struct Message {
    role: &'static str,
    content: String,
}

#[derive(Serialize)]
struct Request {
    model: &'static str,
    max_tokens: u32,
    system: String,
    messages: Vec<Message>,
}

#[derive(Deserialize)]
struct Response {
    content: Vec<ContentBlock>,
}

#[derive(Deserialize)]
struct ContentBlock {
    text: Option<String>,
}

/// Call Claude with a system prompt and user message. Returns the assistant's
/// text response. Errors on network failure or missing API key.
pub async fn call_claude(
    api_key: &str,
    system: &str,
    user_message: &str,
) -> AppResult<String> {
    if api_key.is_empty() {
        return Err(AppError::Invalid("Claude API key is not set".into()));
    }

    let client = Client::new();
    let body = Request {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: system.to_string(),
        messages: vec![Message {
            role: "user",
            content: user_message.to_string(),
        }],
    };

    let resp = client
        .post(API_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Invalid(format!("Claude API request failed: {e}")))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Invalid(format!(
            "Claude API error {status}: {text}"
        )));
    }

    let data: Response = resp
        .json()
        .await
        .map_err(|e| AppError::Invalid(format!("Claude API response parse error: {e}")))?;

    let text = data
        .content
        .into_iter()
        .filter_map(|b| b.text)
        .collect::<Vec<_>>()
        .join("");

    if text.is_empty() {
        return Err(AppError::Invalid("Claude returned empty response".into()));
    }

    Ok(text)
}

/// Fetch the text content of a URL. Used by /ingest to grab article text.
pub async fn fetch_url(url: &str) -> AppResult<String> {
    let client = Client::builder()
        .user_agent("Jarvis/1.0")
        .build()
        .map_err(|e| AppError::Invalid(format!("HTTP client error: {e}")))?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::Invalid(format!("fetch failed: {e}")))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(AppError::Invalid(format!("fetch error {status} for {url}")));
    }

    let text = resp
        .text()
        .await
        .map_err(|e| AppError::Invalid(format!("reading response body: {e}")))?;

    Ok(text)
}
