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

fn write_i64(buf: &mut Vec<u8>, mut v: i64) {
    if v == 0 {
        buf.push(b'0');
        return;
    }
    if v < 0 {
        buf.push(b'-');
        v = -v;
    }
    let mut digits = [0u8; 20];
    let mut i = 20;
    while v > 0 {
        i -= 1;
        digits[i] = b'0' + (v % 10) as u8;
        v /= 10;
    }
    buf.extend_from_slice(&digits[i..]);
}

fn kernel(input: &Input, c: &mut Vec<i64>, bt: &mut Vec<i64>) -> Output {
    let n = input.dimension;
    let a = &input.left;
    let b = &input.right;
    let mut value_sum: i64 = 0;
    let mut diagonal_sum: i64 = 0;

    /* Blocked transpose of B: sequential reads, blocked strided writes. */
    for ii in (0..n).step_by(32) {
        let i_max = (ii + 32).min(n);
        for jj in (0..n).step_by(32) {
            let j_max = (jj + 32).min(n);
            for i in ii..i_max {
                let base = i * n;
                for j in jj..j_max {
                    bt[j * n + i] = b[base + j];
                }
            }
        }
    }

    /* Row/row dot products with 4-way unrolled accumulator parallelism. */
    let k_lim = n & !3;
    for i in 0..n {
        let a_base = i * n;
        let c_base = i * n;
        let mut row_sum: i64 = 0;
        for j in 0..n {
            let b_base = j * n;
            let mut s0: i64 = 0;
            let mut s1: i64 = 0;
            let mut s2: i64 = 0;
            let mut s3: i64 = 0;
            let mut k = 0;
            while k < k_lim {
                // Bounds checks hoisted: all indices provably in range.
                unsafe {
                    s0 += a.get_unchecked(a_base + k) * bt.get_unchecked(b_base + k);
                    s1 += a.get_unchecked(a_base + k + 1) * bt.get_unchecked(b_base + k + 1);
                    s2 += a.get_unchecked(a_base + k + 2) * bt.get_unchecked(b_base + k + 2);
                    s3 += a.get_unchecked(a_base + k + 3) * bt.get_unchecked(b_base + k + 3);
                }
                k += 4;
            }
            let mut s = (s0 + s1) + (s2 + s3);
            while k < n {
                unsafe {
                    s += a.get_unchecked(a_base + k) * bt.get_unchecked(b_base + k);
                }
                k += 1;
            }
            c[c_base + j] = s;
            row_sum += s;
            if i == j {
                diagonal_sum += s;
            }
        }
        value_sum += row_sum;
    }

    let nn = n * n;
    let mut checksum_buf = Vec::with_capacity(nn * 12 + 64);
    checksum_buf.extend_from_slice(b"dimension=");
    write_i64(&mut checksum_buf, n as i64);
    checksum_buf.push(b'\n');
    for val in c.iter() {
        write_i64(&mut checksum_buf, *val);
        checksum_buf.push(b',');
    }
    checksum_buf.push(b'\n');

    let checksum = {
        let hash = Sha256::digest(&checksum_buf);
        const HEX: &[u8; 16] = b"0123456789abcdef";
        let mut s = String::with_capacity(64);
        for &b in hash.as_slice() {
            s.push(HEX[(b >> 4) as usize] as char);
            s.push(HEX[(b & 0xf) as usize] as char);
        }
        s
    };

    Output {
        benchmark: "matrix-multiplication",
        version: 1,
        dimension: n,
        element_count: nn,
        value_sum,
        diagonal_sum,
        checksum,
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
    let nn = input.dimension * input.dimension;
    let mut product = vec![0i64; nn];
    let mut transposed = vec![0i64; nn];

    for line in stdin.lines() {
        let line = line.unwrap();
        if line.is_empty() {
            continue;
        }
        let msg: serde_json::Value = serde_json::from_str(&line).unwrap();
        match msg["type"].as_str() {
            Some("run") => {
                let request_id = msg["requestId"].as_u64().unwrap();
                let output = kernel(&input, &mut product, &mut transposed);
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
