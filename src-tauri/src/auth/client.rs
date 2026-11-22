//! Supabase Auth (GoTrue) REST calls. Errors are reduced to two kinds and carry
//! no URL, body or token, so that they can be logged and shown safely.

use std::future::Future;
use std::time::Duration;

use serde::Deserialize;

use super::config::AuthConfig;
use super::Provider;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApiError {
    /// No connection, timeout, 5xx or 429: the credentials may still be good.
    Network,
    /// The server refused the code or refresh token (other 4xx).
    Rejected,
}

#[derive(Clone)]
pub struct Tokens {
    pub access_token: String,
    pub refresh_token: String,
    /// Seconds until the access token expires.
    pub expires_in: u64,
    pub user_id: String,
    pub provider: Option<Provider>,
    pub display_name: Option<String>,
}

impl std::fmt::Debug for Tokens {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Tokens")
            .field("expires_in", &self.expires_in)
            .finish_non_exhaustive()
    }
}

pub trait AuthApi: Send + Sync + 'static {
    fn exchange_code(
        &self,
        code: &str,
        verifier: &str,
    ) -> impl Future<Output = Result<Tokens, ApiError>> + Send;
    fn refresh(&self, refresh_token: &str)
        -> impl Future<Output = Result<Tokens, ApiError>> + Send;
    /// Best effort: revokes the session on the server (`scope=local`).
    fn logout(&self, access_token: &str) -> impl Future<Output = Result<(), ApiError>> + Send;
}

pub struct HttpClient {
    config: Option<AuthConfig>,
    http: reqwest::Client,
}

impl HttpClient {
    pub fn new(config: Option<AuthConfig>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .connect_timeout(Duration::from_secs(8))
            .build()
            .expect("the HTTP client builds");
        HttpClient { config, http }
    }

    fn config(&self) -> Result<&AuthConfig, ApiError> {
        self.config.as_ref().ok_or(ApiError::Rejected)
    }

    async fn post_tokens(&self, path: &str, body: serde_json::Value) -> Result<Tokens, ApiError> {
        let config = self.config()?;
        let response = self
            .http
            .post(format!("{}{path}", config.url))
            .header("apikey", &config.publishable_key)
            .json(&body)
            .send()
            .await
            .map_err(|_| ApiError::Network)?;
        let status = response.status();
        if !status.is_success() {
            return Err(classify(status.as_u16()));
        }
        // Reading the body is transport (retryable); a body that arrived but is
        // not a token response is a refusal.
        let bytes = response.bytes().await.map_err(|_| ApiError::Network)?;
        parse_tokens(&bytes)
    }
}

fn parse_tokens(bytes: &[u8]) -> Result<Tokens, ApiError> {
    serde_json::from_slice::<TokenResponse>(bytes)
        .map(TokenResponse::into_tokens)
        .map_err(|_| ApiError::Rejected)
}

fn classify(status: u16) -> ApiError {
    match status {
        408 | 429 | 500..=599 => ApiError::Network,
        _ => ApiError::Rejected,
    }
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
    #[serde(default)]
    expires_in: u64,
    user: TokenUser,
}

#[derive(Deserialize)]
struct TokenUser {
    id: String,
    #[serde(default)]
    app_metadata: serde_json::Value,
    #[serde(default)]
    user_metadata: serde_json::Value,
}

impl TokenResponse {
    fn into_tokens(self) -> Tokens {
        let provider = self
            .user
            .app_metadata
            .get("provider")
            .and_then(|p| p.as_str())
            .and_then(Provider::parse);
        // Names only: the e-mail address is never read.
        let display_name = ["full_name", "name", "user_name", "preferred_username"]
            .iter()
            .filter_map(|key| self.user.user_metadata.get(*key).and_then(|v| v.as_str()))
            .map(str::trim)
            .find(|v| !v.is_empty())
            .map(|v| v.chars().take(100).collect());
        Tokens {
            access_token: self.access_token,
            refresh_token: self.refresh_token,
            expires_in: self.expires_in,
            user_id: self.user.id,
            provider,
            display_name,
        }
    }
}

impl AuthApi for HttpClient {
    async fn exchange_code(&self, code: &str, verifier: &str) -> Result<Tokens, ApiError> {
        self.post_tokens(
            "/auth/v1/token?grant_type=pkce",
            serde_json::json!({ "auth_code": code, "code_verifier": verifier }),
        )
        .await
    }

    async fn refresh(&self, refresh_token: &str) -> Result<Tokens, ApiError> {
        self.post_tokens(
            "/auth/v1/token?grant_type=refresh_token",
            serde_json::json!({ "refresh_token": refresh_token }),
        )
        .await
    }

    async fn logout(&self, access_token: &str) -> Result<(), ApiError> {
        let config = self.config()?;
        let response = self
            .http
            .post(format!("{}/auth/v1/logout?scope=local", config.url))
            .header("apikey", &config.publishable_key)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|_| ApiError::Network)?;
        if response.status().is_success() {
            Ok(())
        } else {
            Err(classify(response.status().as_u16()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn statuses_are_classified() {
        assert_eq!(classify(400), ApiError::Rejected);
        assert_eq!(classify(401), ApiError::Rejected);
        assert_eq!(classify(429), ApiError::Network);
        assert_eq!(classify(503), ApiError::Network);
    }

    #[test]
    fn an_unreadable_body_is_a_refusal_not_a_network_error() {
        assert_eq!(parse_tokens(b"not json").unwrap_err(), ApiError::Rejected);
        assert_eq!(parse_tokens(b"{}").unwrap_err(), ApiError::Rejected);
    }

    #[test]
    fn the_token_response_is_reduced_to_what_is_needed() {
        let body: TokenResponse = serde_json::from_value(serde_json::json!({
            "access_token": "A", "refresh_token": "R", "expires_in": 3600, "token_type": "bearer",
            "user": {
                "id": "u1", "email": "me@example.com",
                "app_metadata": { "provider": "github" },
                "user_metadata": { "user_name": "octocat", "full_name": "The Octocat" }
            }
        }))
        .unwrap();
        let tokens = body.into_tokens();
        assert_eq!(tokens.provider, Some(Provider::Github));
        assert_eq!(tokens.display_name.as_deref(), Some("The Octocat"));
        assert_eq!(tokens.expires_in, 3600);
        let shown = format!("{tokens:?}");
        assert!(!shown.contains("access_token") && !shown.contains("refresh_token"));
    }
}
