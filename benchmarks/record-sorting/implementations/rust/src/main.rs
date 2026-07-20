use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::{env, fs};

const PROTOCOL_VERSION: &str = "2.0.0";

#[derive(Clone, Deserialize, Serialize)]
struct Record {
    id: i64,
    score: i64,
    timestamp: i64,
}

#[derive(Deserialize)]
struct Input {
    records: Vec<Record>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Output {
    benchmark: &'static str,
    version: u32,
    record_count: usize,
    first_records: Vec<Record>,
    last_records: Vec<Record>,
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

fn append_i64(buf: &mut [u8], mut n: i64) -> usize {
    if n == 0 {
        buf[0] = b'0';
        return 1;
    }
    let neg = n < 0;
    if neg {
        n = -n;
    }
    let mut tmp = [0u8; 20];
    let mut len = 0usize;
    while n > 0 {
        tmp[len] = b'0' + (n % 10) as u8;
        len += 1;
        n /= 10;
    }
    let mut pos = 0usize;
    if neg {
        buf[pos] = b'-';
        pos += 1;
    }
    for i in (0..len).rev() {
        buf[pos] = tmp[i];
        pos += 1;
    }
    pos
}

fn hash_record(hasher: &mut Sha256, r: &Record) {
    let mut buf = [0u8; 64];
    let mut pos = append_i64(&mut buf, r.id);
    buf[pos] = b',';
    pos += 1;
    pos += append_i64(&mut buf[pos..], r.score);
    buf[pos] = b',';
    pos += 1;
    pos += append_i64(&mut buf[pos..], r.timestamp);
    buf[pos] = b'\n';
    pos += 1;
    hasher.update(&buf[..pos]);
}

fn kernel(mut records: Vec<Record>) -> Output {
    records.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then(a.timestamp.cmp(&b.timestamp))
            .then(a.id.cmp(&b.id))
    });

    let n = records.len();
    let take = n.min(10);
    let first_records = records[..take].to_vec();
    let last_records = records[n - take..].to_vec();

    let mut hasher = Sha256::new();
    for r in &records {
        hash_record(&mut hasher, r);
    }

    Output {
        benchmark: "record-sorting",
        version: 1,
        record_count: n,
        first_records,
        last_records,
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
                let records = input.records.clone();
                let output = kernel(records);
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
