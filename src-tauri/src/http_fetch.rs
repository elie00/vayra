use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};

const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarborFetchArgs {
    pub url: String,
    pub method: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarborFetchResponse {
    pub status: u16,
    pub ok: bool,
    pub body: String,
    pub content_type: Option<String>,
}

fn parse_http_url(raw: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(raw).map_err(|e| format!("url: {}", e))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(format!("scheme not allowed: {}", parsed.scheme()));
    }
    Ok(parsed)
}

fn parse_method(raw: Option<&str>) -> Result<reqwest::Method, String> {
    let method = raw.unwrap_or("GET").to_uppercase();
    reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| format!("method: {}", e))
}

#[tauri::command]
pub async fn harbor_fetch(args: HarborFetchArgs) -> Result<HarborFetchResponse, String> {
    // N'autoriser que http/https : empêche cette primitive de fetch natif (qui
    // contourne CORS) d'atteindre des schémas locaux/dangereux (file://, etc.).
    // On ne bloque PAS les IP privées/loopback : des addons Stremio légitimes
    // tournent en local (127.0.0.1 / LAN).
    let parsed_url = parse_http_url(&args.url)?;

    let timeout = Duration::from_millis(args.timeout_ms.unwrap_or(30_000));
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .no_proxy()
        .build()
        .map_err(|e| format!("client: {}", e))?;

    let parsed_method = parse_method(args.method.as_deref())?;

    let mut req = client.request(parsed_method, parsed_url);

    let mut has_user_agent = false;
    if let Some(headers) = args.headers {
        for (k, v) in headers {
            if k.eq_ignore_ascii_case("user-agent") {
                has_user_agent = true;
            }
            req = req.header(k, v);
        }
    }
    if !has_user_agent {
        req = req.header("User-Agent", BROWSER_UA);
    }
    req = req.header("Accept", "application/json, text/plain, */*");
    req = req.header("Accept-Language", "en-US,en;q=0.9");

    if let Some(body) = args.body {
        req = req.body(body);
    }

    let res = req.send().await.map_err(|e| format!("send: {}", e))?;
    let status = res.status().as_u16();
    let ok = res.status().is_success();
    let content_type = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let body = res.text().await.unwrap_or_default();

    Ok(HarborFetchResponse {
        status,
        ok,
        body,
        content_type,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_http_and_https_urls() {
        assert_eq!(
            parse_http_url("https://example.com/addon")
                .unwrap()
                .scheme(),
            "https"
        );
        assert_eq!(
            parse_http_url("http://127.0.0.1:11470/manifest.json")
                .unwrap()
                .scheme(),
            "http"
        );
        assert_eq!(
            parse_http_url("file:///etc/passwd").unwrap_err(),
            "scheme not allowed: file"
        );
        assert!(parse_http_url("not a url")
            .unwrap_err()
            .starts_with("url: "));
    }

    #[test]
    fn parses_methods_case_insensitively_and_defaults_to_get() {
        assert_eq!(parse_method(None).unwrap(), reqwest::Method::GET);
        assert_eq!(parse_method(Some("post")).unwrap(), reqwest::Method::POST);
        assert_eq!(parse_method(Some("pAtCh")).unwrap(), reqwest::Method::PATCH);
        assert!(parse_method(Some("bad method"))
            .unwrap_err()
            .starts_with("method: "));
    }
}
