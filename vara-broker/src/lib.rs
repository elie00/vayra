// Library surface for vayra-vara-broker so integration tests can drive the
// broker over a real socket without going through the binary entrypoint.

pub mod broker;
pub mod protocol;
pub mod server;
pub mod transport;
