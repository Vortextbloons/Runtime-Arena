use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{self, BufRead, BufReader, Write};
use std::{env, fs};

const PROTOCOL_VERSION: &str = "2.0.0";
const HEX: &[u8; 16] = b"0123456789abcdef";

#[derive(Deserialize)]
struct Input {
    // Box<str> is two machine words instead of String's three. The JSON is
    // parsed before `ready`, so this is simply a more compact input layout.
    words: Vec<Box<str>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Output<'a> {
    benchmark: &'static str,
    version: u32,
    total_words: usize,
    unique_words: usize,
    top_words: Vec<TopWord<'a>>,
    checksum: String,
}

#[derive(Serialize)]
struct TopWord<'a> {
    // Borrow the input strings. serde_json consumes the value immediately,
    // so allocating ten new Strings is unnecessary.
    word: &'a str,
    count: u32,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum Request {
    #[serde(rename = "run")]
    Run {
        #[serde(rename = "requestId")]
        request_id: u64,
    },
    #[serde(rename = "finish")]
    Finish,
}

#[derive(Serialize)]
struct ReadyResponse {
    #[serde(rename = "type")]
    kind: &'static str,
    #[serde(rename = "protocolVersion")]
    protocol_version: &'static str,
}

#[derive(Serialize)]
struct ResultResponse<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    #[serde(rename = "requestId")]
    request_id: u64,
    digest: &'a str,
}

#[derive(Serialize)]
struct FinishResponse<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    digest: &'a str,
}

fn argument(name: &str) -> String {
    let mut args = env::args();
    while let Some(arg) = args.next() {
        if arg == name {
            return args.next().expect("missing argument value");
        }
    }
    panic!("missing argument: {name}");
}

fn lower_hex(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for &byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn digest_bytes(bytes: &[u8]) -> String {
    lower_hex(&Sha256::digest(bytes))
}

fn emit_line<T: Serialize>(stdout: &mut impl Write, value: &T) {
    serde_json::to_writer(&mut *stdout, value).expect("failed to serialize protocol response");
    stdout
        .write_all(b"\n")
        .expect("failed to write protocol newline");
    stdout.flush().expect("failed to flush protocol response");
}

#[inline]
fn decimal_bytes(mut value: u32, buffer: &mut [u8; 10]) -> &[u8] {
    let mut start = buffer.len();
    loop {
        start -= 1;
        buffer[start] = b'0' + (value % 10) as u8;
        value /= 10;
        if value == 0 {
            return &buffer[start..];
        }
    }
}

fn kernel(words: &[Box<str>], output_bytes: &mut Vec<u8>) {
    // This remains deliberately local to each run: every iteration performs
    // the complete counting workload with fresh logical state.
    let mut frequencies: FxHashMap<&str, u32> =
        FxHashMap::with_capacity_and_hasher(words.len() / 2, Default::default());

    for word in words {
        *frequencies.entry(word.as_ref()).or_insert(0) += 1;
    }

    let mut entries: Vec<(&str, u32)> = frequencies.into_iter().collect();

    // The comparator defines a total order because map keys are unique, so a
    // stable sort provides no semantic benefit.
    entries.sort_unstable_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(b.0)));

    let mut hasher = Sha256::new();
    let mut digits_buffer = [0u8; 10];
    let mut line_buffer = [0u8; 128];
    let mut suffix_buffer = [0u8; 12]; // ',' + at most 10 digits + '\n'

    for (word, count) in &entries {
        let digits = decimal_bytes(*count, &mut digits_buffer);
        let required = word.len() + digits.len() + 2;

        if required <= line_buffer.len() {
            // Common path: one SHA-256 update per entry, matching the useful
            // property of the original implementation without its 64-byte
            // overflow hazard.
            let word_len = word.len();
            line_buffer[..word_len].copy_from_slice(word.as_bytes());
            line_buffer[word_len] = b',';
            line_buffer[word_len + 1..word_len + 1 + digits.len()]
                .copy_from_slice(digits);
            line_buffer[required - 1] = b'\n';
            hasher.update(&line_buffer[..required]);
        } else {
            // Rare long-word fallback: remain correct without heap allocation.
            let suffix_len = digits.len() + 2;
            suffix_buffer[0] = b',';
            suffix_buffer[1..1 + digits.len()].copy_from_slice(digits);
            suffix_buffer[suffix_len - 1] = b'\n';
            hasher.update(word.as_bytes());
            hasher.update(&suffix_buffer[..suffix_len]);
        }
    }

    let checksum = lower_hex(&hasher.finalize());
    let top_words = entries
        .iter()
        .take(10)
        .map(|(word, count)| TopWord {
            word: *word,
            count: *count,
        })
        .collect();

    let output = Output {
        benchmark: "word-frequency",
        version: 1,
        total_words: words.len(),
        unique_words: entries.len(),
        top_words,
        checksum,
    };

    output_bytes.clear();
    serde_json::to_writer(output_bytes, &output).expect("failed to serialize benchmark output");
}

fn main() {
    assert_eq!(argument("--protocol-version"), PROTOCOL_VERSION);
    let output_path = argument("--output");

    // from_slice avoids constructing and validating an intermediate UTF-8
    // String. Input parsing remains outside the measured run requests.
    let input_bytes = fs::read(argument("--input")).expect("failed to read input");
    let input: Input = serde_json::from_slice(&input_bytes).expect("invalid input JSON");

    let stdout = io::stdout();
    let mut stdout = stdout.lock();
    emit_line(
        &mut stdout,
        &ReadyResponse {
            kind: "ready",
            protocol_version: PROTOCOL_VERSION,
        },
    );

    let stdin = BufReader::new(io::stdin().lock());
    let mut last_output_bytes = Vec::with_capacity(512);
    let mut last_digest = String::new();

    for line in stdin.lines() {
        let line = line.expect("failed to read protocol request");
        if line.is_empty() {
            continue;
        }

        let request: Request = serde_json::from_str(&line).expect("invalid protocol request");
        match request {
            Request::Run { request_id } => {
                kernel(&input.words, &mut last_output_bytes);
                last_digest = digest_bytes(&last_output_bytes);
                emit_line(
                    &mut stdout,
                    &ResultResponse {
                        kind: "result",
                        request_id,
                        digest: &last_digest,
                    },
                );
            }
            Request::Finish => {
                if last_digest.is_empty() {
                    panic!("finish received before any run request");
                }
                fs::write(&output_path, &last_output_bytes)
                    .expect("failed to write benchmark output");
                emit_line(
                    &mut stdout,
                    &FinishResponse {
                        kind: "finish",
                        digest: &last_digest,
                    },
                );
                break;
            }
        }
    }
}