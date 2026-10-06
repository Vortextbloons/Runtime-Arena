use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::{env, fs};

const PROTOCOL_VERSION: &str = "2.0.0";
const RADIX_SIZE: usize = 65536;

#[derive(Clone, Copy, Deserialize, Serialize)]
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

struct State {
    input: Vec<Record>,
    buf_a: Vec<Record>,
    buf_b: Vec<Record>,
    counts: Vec<u32>,
}

#[inline(always)]
fn rkey(r: &Record, sel: usize) -> u64 {
    if sel == 0 {
        (r.id as u64) ^ 0x8000_0000_0000_0000
    } else if sel == 1 {
        (r.timestamp as u64) ^ 0x8000_0000_0000_0000
    } else {
        (r.score as u64) ^ 0x7FFF_FFFF_FFFF_FFFF
    }
}

fn radix_pass(src: &[Record], dst: &mut [Record], sel: usize, shift: u32, counts: &mut [u32]) {
    counts.fill(0);
    for r in src.iter() {
        counts[((rkey(r, sel) >> shift) & 0xFFFF) as usize] += 1;
    }
    let mut sum: u32 = 0;
    for c in counts.iter_mut() {
        let v = *c;
        *c = sum;
        sum += v;
    }
    for r in src.iter() {
        let d = ((rkey(r, sel) >> shift) & 0xFFFF) as usize;
        let pos = counts[d] as usize;
        counts[d] += 1;
        dst[pos] = *r;
    }
}

/// 12 stable LSD passes over (id, timestamp, score-desc) keys. Fully general.
fn radix_sort(state: &mut State) -> &[Record] {
    let n = state.input.len();
    // Pass 0 copies straight out of the pristine input (no separate memcpy).
    {
        let State {
            input,
            buf_a,
            counts,
            ..
        } = &mut *state;
        radix_pass(input, &mut buf_a[..n], 0, 0, counts);
    }
    for pass in 1..12 {
        let sel = pass >> 2;
        let shift = ((pass & 3) << 4) as u32;
        let State {
            buf_a, buf_b, counts, ..
        } = &mut *state;
        if pass & 1 == 1 {
            radix_pass(&buf_a[..n], &mut buf_b[..n], sel, shift, counts);
        } else {
            radix_pass(&buf_b[..n], &mut buf_a[..n], sel, shift, counts);
        }
    }
    // Last pass (11, odd) lands in buf_b.
    &state.buf_b[..n]
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

fn append_i64(buf: &mut [u8], n: i64) -> usize {
    if n == 0 {
        buf[0] = b'0';
        return 1;
    }
    // Unsigned magnitude handles i64::MIN correctly.
    let neg = n < 0;
    let mut u = if neg {
        n.wrapping_neg() as u64
    } else {
        n as u64
    };
    if neg && n == i64::MIN {
        u = (i64::MAX as u64) + 1;
    }
    let mut tmp = [0u8; 20];
    let mut len = 0usize;
    while u > 0 {
        tmp[len] = b'0' + (u % 10) as u8;
        len += 1;
        u /= 10;
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

fn kernel(sorted: &[Record]) -> Output {
    let n = sorted.len();
    let take = n.min(10);
    let first_records = sorted[..take].to_vec();
    let last_records = sorted[n - take..].to_vec();

    let mut hasher = Sha256::new();
    for r in sorted {
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

    let n = input.records.len();
    let zero = Record {
        id: 0,
        score: 0,
        timestamp: 0,
    };
    let mut state = State {
        input: input.records,
        buf_a: vec![zero; n],
        buf_b: vec![zero; n],
        counts: vec![0u32; RADIX_SIZE],
    };

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
                let output = {
                    let sorted = radix_sort(&mut state);
                    kernel(sorted)
                };
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
