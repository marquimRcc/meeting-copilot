use tauri::{AppHandle, Emitter, Runtime};
use futures_util::StreamExt;
use log::info;

/// Health check nativo para provedores de IA (LM Studio, Ollama, OpenAI)
/// Executado em Rust para contornar restrições de CORS do WebKitGTK.
#[tauri::command]
pub async fn api_copilot_check_health<R: Runtime>(
    _app: AppHandle<R>,
    endpoint: String,
    provider: String,
    api_key: Option<String>,
) -> Result<serde_json::Value, String> {
    let start = std::time::Instant::now();
    let is_ollama = provider == "ollama";
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let clean_endpoint = endpoint.trim_end_matches('/');
    let target_url = if is_ollama {
        format!("{}/api/tags", clean_endpoint)
    } else {
        format!("{}/models", clean_endpoint)
    };

    let mut request = client.get(&target_url);
    if let Some(key) = api_key.filter(|k| !k.trim().is_empty()) {
        request = request.header("Authorization", format!("Bearer {}", key));
    }

    match request.send().await {
        Ok(res) => {
            let latency_ms = start.elapsed().as_millis() as u64;
            if !res.status().is_success() {
                return Ok(serde_json::json!({
                    "ok": false,
                    "provider": provider,
                    "endpoint": endpoint,
                    "statusText": format!("Servidor retornou status HTTP {}", res.status()),
                    "models": [],
                    "latencyMs": latency_ms
                }));
            }

            let json = res.json::<serde_json::Value>().await.unwrap_or_default();
            let mut models = Vec::new();
            if is_ollama {
                if let Some(arr) = json.get("models").and_then(|m| m.as_array()) {
                    for item in arr {
                        if let Some(name) = item.get("name").or_else(|| item.get("model")).and_then(|n| n.as_str()) {
                            models.push(name.to_string());
                        }
                    }
                }
            } else {
                if let Some(arr) = json.get("data").and_then(|d| d.as_array()) {
                    for item in arr {
                        if let Some(id) = item.get("id").and_then(|n| n.as_str()) {
                            models.push(id.to_string());
                        }
                    }
                }
            }

            let status_text = if !models.is_empty() {
                let p_name = if provider == "custom-openai" { "LM Studio" } else if is_ollama { "Ollama" } else { "Servidor" };
                format!("{} online ({} modelos detectados)", p_name, models.len())
            } else {
                "Servidor online".to_string()
            };

            Ok(serde_json::json!({
                "ok": true,
                "provider": provider,
                "endpoint": endpoint,
                "statusText": status_text,
                "models": models,
                "latencyMs": latency_ms
            }))
        }
        Err(e) => {
            let latency_ms = start.elapsed().as_millis() as u64;
            let p_name = if provider == "custom-openai" { "LM Studio (porta 1234)" } else if is_ollama { "Ollama (porta 11434)" } else { "Servidor de IA" };
            let status_text = format!("{} inacessível em {}: {}", p_name, endpoint, e);
            Ok(serde_json::json!({
                "ok": false,
                "provider": provider,
                "endpoint": endpoint,
                "statusText": status_text,
                "models": [],
                "latencyMs": latency_ms
            }))
        }
    }
}

/// Chamada de streaming de chat nativa em Rust.
/// Emite eventos 'copilot-token' em tempo real para o frontend Tauri,
/// eliminando 100% dos bloqueios de CORS e 'Load failed' do WebKitGTK.
#[tauri::command]
pub async fn api_copilot_stream_chat<R: Runtime>(
    app: AppHandle<R>,
    endpoint: String,
    model: String,
    system_prompt: String,
    user_prompt: String,
    api_key: Option<String>,
    provider: String,
) -> Result<String, String> {
    info!("🤖 [Copilot] Iniciando streaming nativo via Rust para {} ({})", endpoint, model);
    let is_ollama = provider == "ollama";
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let clean_endpoint = endpoint.trim_end_matches('/');
    let target_url = if is_ollama {
        format!("{}/api/chat", clean_endpoint)
    } else {
        format!("{}/chat/completions", clean_endpoint)
    };

    let payload = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_prompt }
        ],
        "stream": true
    });

    let mut request = client.post(&target_url)
        .header("Content-Type", "application/json")
        .json(&payload);

    if let Some(key) = api_key.filter(|k| !k.trim().is_empty()) {
        request = request.header("Authorization", format!("Bearer {}", key));
    }

    let response = request.send().await.map_err(|e| {
        format!("Falha ao conectar com o provedor {} em {}: {}", provider, target_url, e)
    })?;

    if !response.status().is_success() {
        let status = response.status();
        let err_body = response.text().await.unwrap_or_default();
        return Err(format!("Erro na chamada ({}) status {}: {}", target_url, status, err_body));
    }

    let mut stream = response.bytes_stream();
    let mut accumulated = String::new();
    let mut buffer = String::new();

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|e| format!("Erro no streaming: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);
        buffer.push_str(&text);

        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim().to_string();
            buffer = buffer[pos + 1..].to_string();

            if line.is_empty() || line.starts_with(':') {
                continue;
            }

            if line == "data: [DONE]" {
                break;
            }

            let token = if is_ollama {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                    val.get("message")
                        .and_then(|m| m.get("content"))
                        .and_then(|c| c.as_str())
                        .unwrap_or("")
                        .to_string()
                } else {
                    String::new()
                }
            } else if line.starts_with("data: ") {
                let json_part = &line[6..];
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_part) {
                    val.get("choices")
                        .and_then(|c| c.as_array())
                        .and_then(|arr| arr.first())
                        .and_then(|first| first.get("delta"))
                        .and_then(|d| d.get("content"))
                        .and_then(|c| c.as_str())
                        .unwrap_or("")
                        .to_string()
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            if !token.is_empty() {
                accumulated.push_str(&token);
                let _ = app.emit("copilot-token", serde_json::json!({
                    "token": token,
                    "accumulated": accumulated
                }));
            }
        }
    }

    info!("✅ [Copilot] Streaming concluído com sucesso ({} caracteres gerados)", accumulated.len());
    let _ = app.emit("copilot-done", serde_json::json!({
        "full_text": accumulated
    }));

    Ok(accumulated)
}
