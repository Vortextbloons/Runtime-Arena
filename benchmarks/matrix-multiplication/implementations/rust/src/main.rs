use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::{env, fs};

const PROTOCOL_VERSION: &str = "2.0.0";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Input {
    dimension: usize,
    left: Vec<i64>,
    right: Vec<i64>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Output {
    benchmark: &'static str,
    version: u32,
    dimension: usize,
    element_count: usize,
    value_sum: i64,
    diagonal_sum: i64,
    checksum: String,
}

fn argument(name: &str) -> String {
    let args: Vec<String> = env::args().collect();
    args.get(args.iter().position(|x| x == name).expect("missing argument") + 1)
        .expect("missing value")
        .clone()
}

fn digest_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn emit_line(value: &serde_json::Value) {
    let mut stdout = std::io::stdout().lock();
    serde_json::to_writer(&mut stdout, value).unwrap();
    stdout.write_all(b"\n").unwrap();
    stdout.flush().unwrap();
}

fn kernel(input: &Input) -> Output {
    let n = input.dimension;
    let a = &input.left;
    let b = &input.right;
    let mut c = vec![0i64; n * n];
    let mut value_sum: i64 = 0;
    let mut diagonal_sum: i64 = 0;
    for i in 0..n {
        for j in 0..n {
            let mut sum: i64 = 0;
            for k in 0..n {
                sum += a[i * n + k] * b[k * n + j];
            }
            c[i * n + j] = sum;
            value_sum += sum;
            if i == j {
                diagonal_sum += sum;
            }
        }
    }
    let mut hasher = Sha256::new();
    hasher.update(format!("dimension={}\n", n));
    for val in &c {
        hasher.update(format!("{},", val));
    }
    hasher.update("\n");
    Output {
        benchmark: "matrix-multiplication",
        version: 1,
        dimension: n,
        element_count: n * n,
        value_sum,
        diagonal_sum,
        checksum: format!("{:x}", hasher.finalize()),
    }
}

fn main() {
    assert_eq!(argument("--protocol-version"), PROTOCOL_VERSION);
    let output_path = argument("--output");
    let input: Input =
        serde_json::from_str(&fs::read_to_string(argument("--input")).unwrap()).unwrap();

    emit_line(&serde_json::json!({
        "type": "ready",
        "protocolVersion": PROTOCOL_VERSION
    }));

    let stdin = BufReader::new(std::io::stdin().lock());
    let mut last_output_bytes = Vec::new();

    for line in stdin.lines() {
        let line = line.unwrap();
        if line.is_empty() {
            continue;
        }
        let msg: serde_json::Value = serde_json::from_str(&line).unwrap();
        match msg["type"].as_str() {
            Some("run") => {
                let request_id = msg["requestId"].as_u64().unwrap();
                let output = kernel(&input);
                last_output_bytes = serde_json::to_vec(&output).unwrap();
                emit_line(&serde_json::json!({
                    "type": "result",
                    "requestId": request_id,
                    "digest": digest_bytes(&last_output_bytes)
                }));
            }
            Some("finish") => {
                let digest = digest_bytes(&last_output_bytes);
                fs::write(&output_path, &last_output_bytes).unwrap();
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
