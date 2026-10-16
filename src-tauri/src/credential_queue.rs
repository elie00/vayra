//! Credential store calls run on one dedicated thread. They used to be synchronous
//! Tauri commands, which run on the main thread: a keychain prompt or a slow
//! keychain froze the whole window, Quit included. One thread, not a pool, keeps
//! writes in the order they were issued, as the main thread did.

use std::sync::mpsc;
use std::sync::OnceLock;

type Job = Box<dyn FnOnce() + Send>;

fn queue() -> &'static mpsc::Sender<Job> {
    static QUEUE: OnceLock<mpsc::Sender<Job>> = OnceLock::new();
    QUEUE.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<Job>();
        std::thread::Builder::new()
            .name("credentials".into())
            .spawn(move || {
                for job in rx {
                    // A panicking call must not take later credential calls down with it.
                    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(job));
                }
            })
            .expect("credential thread");
        tx
    })
}

/// Run `f` on the credential thread and wait for its result without blocking the caller.
pub async fn run<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    queue()
        .send(Box::new(move || {
            let _ = tx.send(f());
        }))
        .map_err(|_| "credential thread stopped".to_string())?;
    rx.await.map_err(|_| "credential store call failed".to_string())
}

#[cfg(test)]
mod tests {
    use super::run;
    use std::sync::{Arc, Mutex};

    #[tokio::test]
    async fn returns_the_value_computed_on_the_credential_thread() {
        let caller = std::thread::current().id();
        let (value, thread) = run(|| (21 * 2, std::thread::current().id())).await.unwrap();
        assert_eq!(value, 42);
        assert_ne!(thread, caller);
    }

    #[tokio::test]
    async fn survives_a_panicking_call() {
        assert!(run(|| panic!("keychain exploded")).await.is_err());
        assert_eq!(run(|| 7).await.unwrap(), 7);
    }

    #[tokio::test]
    async fn runs_jobs_in_the_order_they_were_issued() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let jobs: Vec<_> = (0..50)
            .map(|i| {
                let seen = seen.clone();
                run(move || seen.lock().unwrap().push(i))
            })
            .collect();
        futures_util::future::join_all(jobs).await;
        assert_eq!(*seen.lock().unwrap(), (0..50).collect::<Vec<_>>());
    }
}
