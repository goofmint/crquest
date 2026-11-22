//! Secret storage behind a small trait. The production implementation is the
//! OS credential store (Keychain / Credential Manager / Secret Service). There
//! is deliberately no plaintext fallback: when the store is unavailable the
//! session lives in memory for this run only.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use super::Provider;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Slot {
    Session,
    Pending,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoreError;

pub trait SecretStore: Send + Sync + 'static {
    fn load(&self, slot: Slot) -> Result<Option<String>, StoreError>;
    fn save(&self, slot: Slot, value: &str) -> Result<(), StoreError>;
    fn delete(&self, slot: Slot) -> Result<(), StoreError>;
}

/// What is persisted of a signed-in session. The access token is not here:
/// it stays in memory (and stays well under the Windows credential size limit).
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StoredSession {
    pub refresh_token: String,
    pub user_id: String,
    pub provider: Provider,
    pub display_name: Option<String>,
}

impl std::fmt::Debug for StoredSession {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("StoredSession")
            .field("provider", &self.provider)
            .finish_non_exhaustive()
    }
}

/// A login that was started in the browser and not completed yet. Kept in the
/// store too, so that a callback that restarts the app can still be completed.
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PendingAttempt {
    pub verifier: String,
    pub nonce: String,
    pub provider: Provider,
    /// Unix seconds.
    pub created_at: u64,
}

impl std::fmt::Debug for PendingAttempt {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PendingAttempt")
            .field("provider", &self.provider)
            .finish_non_exhaustive()
    }
}

pub struct KeyringStore {
    service: String,
}

impl KeyringStore {
    pub fn new(service: &str) -> Self {
        KeyringStore {
            service: service.to_string(),
        }
    }

    fn entry(&self, slot: Slot) -> Result<keyring::Entry, StoreError> {
        let user = match slot {
            Slot::Session => "supabase-session",
            Slot::Pending => "supabase-pending-login",
        };
        keyring::Entry::new(&self.service, user).map_err(|_| StoreError)
    }
}

impl SecretStore for KeyringStore {
    fn load(&self, slot: Slot) -> Result<Option<String>, StoreError> {
        match self.entry(slot)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(StoreError),
        }
    }

    fn save(&self, slot: Slot, value: &str) -> Result<(), StoreError> {
        self.entry(slot)?
            .set_password(value)
            .map_err(|_| StoreError)
    }

    fn delete(&self, slot: Slot) -> Result<(), StoreError> {
        match self.entry(slot)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(StoreError),
        }
    }
}

/// In-memory store for tests. `failing` simulates an unavailable keyring.
#[derive(Default)]
pub struct MemoryStore {
    entries: Mutex<HashMap<Slot, String>>,
    failing: std::sync::atomic::AtomicBool,
    failing_delete: std::sync::atomic::AtomicBool,
}

impl MemoryStore {
    pub fn unavailable() -> Self {
        let store = MemoryStore::default();
        store
            .failing
            .store(true, std::sync::atomic::Ordering::SeqCst);
        store
    }

    /// Every operation fails from now on (the keyring went away).
    pub fn set_failing(&self, failing: bool) {
        self.failing
            .store(failing, std::sync::atomic::Ordering::SeqCst);
    }

    /// Only `delete` fails (a keyring that refuses removal but accepts writes).
    pub fn set_failing_delete(&self, failing: bool) {
        self.failing_delete
            .store(failing, std::sync::atomic::Ordering::SeqCst);
    }

    pub fn contains(&self, slot: Slot) -> bool {
        self.entries.lock().unwrap().contains_key(&slot)
    }

    fn check(&self) -> Result<(), StoreError> {
        if self.failing.load(std::sync::atomic::Ordering::SeqCst) {
            Err(StoreError)
        } else {
            Ok(())
        }
    }
}

impl SecretStore for MemoryStore {
    fn load(&self, slot: Slot) -> Result<Option<String>, StoreError> {
        self.check()?;
        Ok(self.entries.lock().unwrap().get(&slot).cloned())
    }

    fn save(&self, slot: Slot, value: &str) -> Result<(), StoreError> {
        self.check()?;
        self.entries.lock().unwrap().insert(slot, value.to_string());
        Ok(())
    }

    fn delete(&self, slot: Slot) -> Result<(), StoreError> {
        self.check()?;
        if self
            .failing_delete
            .load(std::sync::atomic::Ordering::SeqCst)
        {
            return Err(StoreError);
        }
        self.entries.lock().unwrap().remove(&slot);
        Ok(())
    }
}
