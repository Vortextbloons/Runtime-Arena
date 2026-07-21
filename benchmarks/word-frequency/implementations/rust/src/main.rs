use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::{env, fs};

const PROTOCOL_VERSION: &str = "2.0.0";

#[derive(Deserialize)]
struct Input {
    words: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Output {
    benchmark: &'static str,
    version: u32,
    total_words: usize,
    unique_words: usize,
    top_words: Vec<TopWord>,
    checksum: String,
}

#[derive(Serialize)]
struct TopWord {
    word: String,
    count: usize,
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

fn kernel(words: &[String]) -> Output {
    let mut freq: HashMap<&str, usize> = HashMap::new();
    for w in words {
        *freq.entry(w.as_str()).or_insert(0) += 1;
    }

    let mut entries: Vec<(&str, usize)> = freq.into_iter().collect();
    entries.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(b.0)));

    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64];
    for (word, count) in &entries {
        let mut pos = 0;
        let wb = word.as_bytes();
        buf[pos..pos + wb.len()].copy_from_slice(wb);
        pos += wb.len();
        buf[pos] = b',';
        pos += 1;
        let mut n = *count;
        let start = pos;
        if n == 0 {
            buf[pos] = b'0';
            pos += 1;
        } else {
            while n > 0 {
                buf[pos] = b'0' + (n % 10) as u8;
                n /= 10;
                pos += 1;
            }
            buf[start..pos].reverse();
        }
        buf[pos] = b'\n';
        pos += 1;
        hasher.update(&buf[..pos]);
    }

    let top_words: Vec<TopWord> = entries
        .iter()
        .take(10)
        .map(|(w, c)| TopWord {
            word: w.to_string(),
            count: *c,
        })
        .collect();

    Output {
        benchmark: "word-frequency",
        version: 1,
        total_words: words.len(),
        unique_words: entries.len(),
        top_words,
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
                let output = kernel(&input.words);
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
