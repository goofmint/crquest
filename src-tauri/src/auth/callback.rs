//! Authorize URL and callback URL handling. Every URL that reaches the app
//! through the custom scheme is untrusted input: anything that does not match
//! exactly is dropped without a trace (nothing from it is logged).

use url::Url;

use super::config::AuthConfig;
use super::Provider;

pub const SCHEME: &str = "terminalquest";
pub const HOST: &str = "auth";
pub const PATH: &str = "/callback";

/// `terminalquest://auth/callback?attempt=<nonce>`: what Supabase redirects to.
pub fn redirect_to(nonce: &str) -> String {
    format!("{SCHEME}://{HOST}{PATH}?attempt={nonce}")
}

/// `{url}/auth/v1/authorize?...` (opened in the system browser).
pub fn authorize_url(
    config: &AuthConfig,
    provider: Provider,
    challenge: &str,
    nonce: &str,
) -> String {
    let mut url = Url::parse(&format!("{}/auth/v1/authorize", config.url))
        .expect("the configured URL was validated");
    url.query_pairs_mut()
        .append_pair("provider", provider.as_str())
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "s256")
        .append_pair("redirect_to", &redirect_to(nonce));
    url.into()
}

/// What the provider (through Supabase) reported.
#[derive(Clone, PartialEq, Eq)]
pub enum Outcome {
    Code(String),
    /// `error` / `error_code` / `error_description` were present.
    Denied(DeniedReason),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeniedReason {
    /// The user refused (`access_denied`).
    AccessDenied,
    Other,
}

// `code` is a one-time secret: never print it.
impl std::fmt::Debug for Outcome {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Outcome::Code(_) => f.write_str("Outcome::Code(..)"),
            Outcome::Denied(reason) => write!(f, "Outcome::Denied({reason:?})"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Callback {
    pub attempt: String,
    pub outcome: Outcome,
}

/// `None` for anything that is not a well-formed callback of this app.
/// The `attempt` value is returned for the caller to compare with the pending
/// attempt; this function does not know the nonce.
pub fn parse(raw: &str) -> Option<Callback> {
    let url = Url::parse(raw).ok()?;
    if url.scheme() != SCHEME || url.host_str() != Some(HOST) || url.path() != PATH {
        return None;
    }
    if url.username() != "" || url.password().is_some() || url.port().is_some() {
        return None;
    }
    let mut attempt = None;
    let mut code = None;
    let mut denied = false;
    let mut access_denied = false;
    // Errors are reported in the query or, by some flows, in the fragment.
    let fragment: Vec<(String, String)> = url
        .fragment()
        .map(|f| {
            url::form_urlencoded::parse(f.as_bytes())
                .into_owned()
                .collect()
        })
        .unwrap_or_default();
    for (key, value) in url
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .chain(fragment)
    {
        match key.as_str() {
            "attempt" if attempt.is_none() => attempt = Some(value),
            "code" if code.is_none() => code = Some(value),
            "error" | "error_code" | "error_description" => {
                denied = true;
                if key == "error" && value == "access_denied" {
                    access_denied = true;
                }
                if key == "error_code" && value == "access_denied" {
                    access_denied = true;
                }
            }
            _ => {}
        }
    }
    let attempt = attempt.filter(|a| !a.is_empty())?;
    let outcome = if denied {
        Outcome::Denied(if access_denied {
            DeniedReason::AccessDenied
        } else {
            DeniedReason::Other
        })
    } else {
        Outcome::Code(code.filter(|c| !c.is_empty())?)
    };
    Some(Callback { attempt, outcome })
}

/// Constant-time comparison of two nonces.
pub fn nonce_matches(expected: &str, given: &str) -> bool {
    let (a, b) = (expected.as_bytes(), given.as_bytes());
    let mut diff = a.len() ^ b.len();
    for i in 0..a.len().max(b.len()) {
        diff |= (a.get(i).copied().unwrap_or(0) ^ b.get(i).copied().unwrap_or(0)) as usize;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> AuthConfig {
        AuthConfig::resolve(None, Some("k"), true).unwrap()
    }

    #[test]
    fn the_authorize_url_carries_the_pkce_parameters_and_redirect() {
        let url = Url::parse(&authorize_url(&config(), Provider::Github, "CHAL", "NONCE")).unwrap();
        assert_eq!(url.path(), "/auth/v1/authorize");
        let pairs: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(pairs["provider"], "github");
        assert_eq!(pairs["code_challenge"], "CHAL");
        assert_eq!(pairs["code_challenge_method"], "s256");
        assert_eq!(
            pairs["redirect_to"],
            "terminalquest://auth/callback?attempt=NONCE"
        );
        // no verifier or key in the URL
        assert!(!url.as_str().contains("verifier"));
        assert!(!url.as_str().contains("apikey"));
    }

    #[test]
    fn a_success_callback_yields_the_code_and_attempt() {
        let callback = parse("terminalquest://auth/callback?attempt=N1&code=abc").unwrap();
        assert_eq!(callback.attempt, "N1");
        assert_eq!(callback.outcome, Outcome::Code("abc".into()));
    }

    #[test]
    fn error_callbacks_are_recognized_in_query_and_fragment() {
        let q = parse("terminalquest://auth/callback?attempt=N1&error=access_denied&error_code=x")
            .unwrap();
        assert_eq!(q.outcome, Outcome::Denied(DeniedReason::AccessDenied));
        let f = parse(
            "terminalquest://auth/callback?attempt=N1#error=server_error&error_description=boom",
        )
        .unwrap();
        assert_eq!(f.outcome, Outcome::Denied(DeniedReason::Other));
    }

    #[test]
    fn malformed_or_foreign_urls_are_dropped() {
        for raw in [
            "not a url",
            "https://auth/callback?attempt=N1&code=abc",
            "terminalquest://evil/callback?attempt=N1&code=abc",
            "terminalquest://auth/other?attempt=N1&code=abc",
            "terminalquest://auth/callback/extra?attempt=N1&code=abc",
            "terminalquest://user@auth/callback?attempt=N1&code=abc",
            "terminalquest://auth:99/callback?attempt=N1&code=abc",
            "terminalquest://auth/callback?code=abc",
            "terminalquest://auth/callback?attempt=&code=abc",
            "terminalquest://auth/callback?attempt=N1",
            "terminalquest://auth/callback?attempt=N1&code=",
        ] {
            assert!(parse(raw).is_none(), "{raw}");
        }
    }

    #[test]
    fn nonces_compare_exactly() {
        assert!(nonce_matches("abc", "abc"));
        assert!(!nonce_matches("abc", "abd"));
        assert!(!nonce_matches("abc", "abcd"));
        assert!(!nonce_matches("abc", ""));
    }

    #[test]
    fn debug_output_hides_the_code() {
        let callback = parse("terminalquest://auth/callback?attempt=N1&code=SECRETCODE").unwrap();
        assert!(!format!("{callback:?}").contains("SECRETCODE"));
    }
}
