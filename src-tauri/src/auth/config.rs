//! Supabase connection settings, fixed at build time.
//!
//! The renderer never supplies them: the Rust side does all the network I/O, so
//! a page script cannot point the app at another server. Only the publishable
//! key is handled here (never a service-role / secret key).

use url::Url;

/// URL of the local OSS Supabase stack (`npm run supabase:start`).
pub const LOCAL_SUPABASE_URL: &str = "http://127.0.0.1:54321";

#[derive(Clone, PartialEq, Eq)]
pub struct AuthConfig {
    /// Origin of the Supabase project, without a trailing slash.
    pub url: String,
    pub publishable_key: String,
}

// The key is public by design, but keep it out of logs anyway.
impl std::fmt::Debug for AuthConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AuthConfig")
            .field("url", &self.url)
            .finish_non_exhaustive()
    }
}

impl AuthConfig {
    /// The configuration compiled into this build (`option_env!`).
    pub fn from_build() -> Option<AuthConfig> {
        Self::resolve(
            option_env!("TERMINALQUEST_SUPABASE_URL"),
            option_env!("TERMINALQUEST_SUPABASE_PUBLISHABLE_KEY"),
            cfg!(debug_assertions),
        )
    }

    /// `None` means "not configured": the game works, login is disabled.
    /// Debug builds default the URL to the local stack and accept `http`;
    /// release builds accept `https` only.
    pub fn resolve(url: Option<&str>, key: Option<&str>, debug: bool) -> Option<AuthConfig> {
        let key = key.map(str::trim).filter(|k| !k.is_empty())?;
        let url = url.map(str::trim).filter(|u| !u.is_empty());
        let url = match (url, debug) {
            (Some(url), _) => url,
            (None, true) => LOCAL_SUPABASE_URL,
            (None, false) => return None,
        };
        let parsed = Url::parse(url).ok()?;
        let allowed = match parsed.scheme() {
            "https" => true,
            "http" => debug,
            _ => false,
        };
        if !allowed || parsed.host_str().is_none() {
            return None;
        }
        Some(AuthConfig {
            url: url.trim_end_matches('/').to_string(),
            publishable_key: key.to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_builds_default_to_the_local_stack() {
        let config = AuthConfig::resolve(None, Some("key"), true).unwrap();
        assert_eq!(config.url, LOCAL_SUPABASE_URL);
    }

    #[test]
    fn a_missing_key_means_unconfigured() {
        assert!(AuthConfig::resolve(None, None, true).is_none());
        assert!(AuthConfig::resolve(Some("https://x.supabase.co"), Some("  "), true).is_none());
    }

    #[test]
    fn release_builds_need_an_https_url() {
        assert!(AuthConfig::resolve(None, Some("key"), false).is_none());
        assert!(AuthConfig::resolve(Some("http://127.0.0.1:54321"), Some("key"), false).is_none());
        assert!(AuthConfig::resolve(Some("ftp://x"), Some("key"), false).is_none());
        let config =
            AuthConfig::resolve(Some("https://x.supabase.co/"), Some("key"), false).unwrap();
        assert_eq!(config.url, "https://x.supabase.co");
    }

    #[test]
    fn debug_output_does_not_contain_the_key() {
        let config = AuthConfig::resolve(None, Some("super-key"), true).unwrap();
        assert!(!format!("{config:?}").contains("super-key"));
    }
}
