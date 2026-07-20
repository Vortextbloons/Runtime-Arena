use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{BufRead, Write};

pub const VERSION: &str = "2.0.0";

pub fn arg(name: &str) -> String {
    let args: Vec<String> = std::env::args().collect();
    args.iter()
        .position(|value| value == name)
        .and_then(|index| args.get(index + 1))
        .cloned()
        .unwrap_or_else(|| panic!("missing {name}"))
}

pub fn digest_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub fn emit_line(value: &serde_json::Value) {
    let mut stdout = std::io::stdout().lock();
    serde_json::to_writer(&mut stdout, value).unwrap();
    stdout.write_all(b"\n").unwrap();
    stdout.flush().unwrap();
}

pub fn run_worker<T, F>(input_path: &str, output_path: &str, mut kernel: F)
where
    T: Serialize,
    F: FnMut() -> T,
{
    if arg("--protocol-version") != VERSION {
        panic!("unsupported protocol version");
    }
    let _ = std::fs::read_to_string(input_path).unwrap();
    emit_line(&serde_json::json!({
        "type": "ready",
        "protocolVersion": VERSION
    }));

    let stdin = std::io::stdin().lock();
    let mut last_output = Vec::new();
    for line in stdin.lines() {
        let line = line.unwrap();
        if line.is_empty() {
            continue;
        }
        let message: serde_json::Value = serde_json::from_str(&line).unwrap();
        match message["type"].as_str() {
            Some("run") => {
                let output = kernel();
                last_output = serde_json::to_vec(&output).unwrap();
                emit_line(&serde_json::json!({
                    "type": "result",
                    "requestId": message["requestId"],
                    "digest": digest_bytes(&last_output)
                }));
            }
            Some("finish") => {
                let digest = digest_bytes(&last_output);
                std::fs::write(output_path, &last_output).unwrap();
                emit_line(&serde_json::json!({
                    "type": "finish",
                    "digest": digest
                }));
                break;
            }
            _ => panic!("unknown protocol message"),
        }
    }
}
