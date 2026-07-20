use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::{env, fs, sync::mpsc, thread};

const PROTOCOL_VERSION: &str = "2.0.0";

struct WorkerResult {
    worker_id: usize,
    local_xor: u32,
    local_sum: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Input {
    schema_version: String,
    worker_count: usize,
    phase_count: usize,
    items_per_worker: usize,
    rounds_per_item: usize,
    initial_seed: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Output {
    schema_version: String,
    benchmark: &'static str,
    worker_count: usize,
    phase_count: usize,
    items_processed: u64,
    final_seed: String,
    digest: String,
}

fn argument(name: &str) -> String {
    let args: Vec<String> = env::args().collect();
    args.get(
        args.iter()
            .position(|x| x == name)
            .expect("missing argument")
            + 1,
    )
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

fn mix32(mut x: u32) -> u32 {
    x ^= x >> 16;
    x = x.wrapping_mul(0x21f0aaad);
    x ^= x >> 15;
    x = x.wrapping_mul(0x735a2d97);
    x ^= x >> 15;
    x
}

fn rotate_left64(x: u64, n: u32) -> u64 {
    x << n | x >> (64 - n)
}

fn spawn_workers(
    result_tx: mpsc::Sender<WorkerResult>,
    worker_count: usize,
    items_per_worker: usize,
    rounds_per_item: usize,
) -> (Vec<thread::JoinHandle<()>>, Vec<mpsc::Sender<u32>>) {
    let mut senders = Vec::with_capacity(worker_count);
    let mut handles = Vec::with_capacity(worker_count);
    for w in 0..worker_count {
        let (tx, rx) = mpsc::channel::<u32>();
        let rt = result_tx.clone();
        senders.push(tx);
        handles.push(thread::spawn(move || loop {
            let phase_seed = match rx.recv() {
                Ok(s) => s,
                Err(_) => break,
            };
            let mut local_xor: u32 = 0;
            let mut local_sum: u64 = 0;
            for local_item in 0..items_per_worker {
                let global_item_id = (w * items_per_worker + local_item) as u32;
                let mut x = phase_seed ^ global_item_id ^ (w as u32).wrapping_mul(0x9e3779b9);
                for _ in 0..rounds_per_item {
                    x ^= x << 13;
                    x ^= x >> 17;
                    x ^= x << 5;
                    x = x.wrapping_mul(0x9e3779b1).wrapping_add(0x85ebca77);
                }
                local_xor ^= x;
                local_sum = local_sum.wrapping_add(x as u64);
            }
            rt.send(WorkerResult {
                worker_id: w,
                local_xor,
                local_sum,
            })
            .unwrap();
        }));
    }
    (handles, senders)
}

fn kernel(
    work_txs: &[mpsc::Sender<u32>],
    result_rx: &mpsc::Receiver<WorkerResult>,
    input: &Input,
    seed_value: u32,
) -> Output {
    let mut phase_seed = seed_value;
    let mut digest: u64 = 0x6a09e667f3bcc909;

    for phase in 0..input.phase_count {
        let mut next_seed = phase_seed ^ (phase as u32);
        let mut phase_sum: u64 = 0;

        for w in 0..input.worker_count {
            work_txs[w].send(phase_seed).unwrap();
        }

        let mut results: Vec<Option<WorkerResult>> = (0..input.worker_count).map(|_| None).collect();
        for _ in 0..input.worker_count {
            let r = result_rx.recv().unwrap();
            let wid = r.worker_id;
            results[wid] = Some(r);
        }

        for r in results.into_iter().flatten() {
            next_seed = mix32(
                next_seed
                    ^ r.local_xor
                    ^ (r.local_sum as u32)
                    ^ ((r.local_sum >> 32) as u32)
                    ^ (r.worker_id as u32),
            );
            phase_sum = phase_sum.wrapping_add(r.local_sum);
        }

        phase_seed = next_seed;
        digest = rotate_left64(digest, 7);
        digest ^= next_seed as u64;
        digest = digest.wrapping_add(phase_sum);
    }

    Output {
        schema_version: "1.0.0".to_string(),
        benchmark: "barrier-wave",
        worker_count: input.worker_count,
        phase_count: input.phase_count,
        items_processed: (input.worker_count as u64)
            * (input.phase_count as u64)
            * (input.items_per_worker as u64),
        final_seed: format!("{:08x}", phase_seed),
        digest: format!("{:016x}", digest),
    }
}

fn main() {
    assert_eq!(argument("--protocol-version"), PROTOCOL_VERSION);
    let output_path = argument("--output");
    let input: Input =
        serde_json::from_str(&fs::read_to_string(argument("--input")).unwrap()).unwrap();
    let seed_value = u32::from_str_radix(&input.initial_seed, 16).unwrap();

    let (result_tx, result_rx) = mpsc::channel::<WorkerResult>();
    let (_handles, work_txs) = spawn_workers(
        result_tx,
        input.worker_count,
        input.items_per_worker,
        input.rounds_per_item,
    );

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
                let output = kernel(&work_txs, &result_rx, &input, seed_value);
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
