use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Barrier};
use std::{env, fs, thread};

const PROTOCOL_VERSION: &str = "2.0.0";

// One slot per worker. The seed is written by the coordinator, the results by
// the owning worker; the two barriers provide the happens-before edges, so
// Relaxed ordering is sufficient. Padded to 128 bytes (multiple of 64) so
// slots never share a cache line.
#[repr(C)]
struct Slot {
    seed: AtomicU32,
    xor: AtomicU32,
    sum: AtomicU64,
    _pad: [u8; 112],
}

impl Slot {
    fn new() -> Self {
        Self {
            seed: AtomicU32::new(0),
            xor: AtomicU32::new(0),
            sum: AtomicU64::new(0),
            _pad: [0; 112],
        }
    }
}

const _: () = assert!(std::mem::size_of::<Slot>() % 64 == 0);

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

#[inline(always)]
fn mix32(mut x: u32) -> u32 {
    x ^= x >> 16;
    x = x.wrapping_mul(0x21f0aaad);
    x ^= x >> 15;
    x = x.wrapping_mul(0x735a2d97);
    x ^= x >> 15;
    x
}

#[inline(always)]
fn xround(mut x: u32) -> u32 {
    x ^= x.wrapping_shl(13);
    x ^= x >> 17;
    x ^= x.wrapping_shl(5);
    x.wrapping_mul(0x9e3779b1).wrapping_add(0x85ebca77)
}

fn worker_body(
    id: usize,
    items: usize,
    rounds: usize,
    slots: &Arc<Vec<Slot>>,
    dispatch: &Arc<Barrier>,
    complete: &Arc<Barrier>,
    stopping: &Arc<AtomicBool>,
) {
    let worker_mul = (id as u32).wrapping_mul(0x9e3779b9);
    let base = (id * items) as u32;
    let n4 = items & !3;
    let slot = &slots[id];
    loop {
        dispatch.wait();
        if stopping.load(Ordering::Relaxed) {
            break;
        }
        let phase_seed = slot.seed.load(Ordering::Relaxed);

        let mut xor0: u32 = 0;
        let mut xor1: u32 = 0;
        let mut xor2: u32 = 0;
        let mut xor3: u32 = 0;
        let mut sum0: u64 = 0;
        let mut sum1: u64 = 0;
        let mut sum2: u64 = 0;
        let mut sum3: u64 = 0;
        let mut item = 0;
        while item < n4 {
            let b = base.wrapping_add(item as u32);
            let mut x0 = phase_seed ^ b ^ worker_mul;
            let mut x1 = phase_seed ^ b.wrapping_add(1) ^ worker_mul;
            let mut x2 = phase_seed ^ b.wrapping_add(2) ^ worker_mul;
            let mut x3 = phase_seed ^ b.wrapping_add(3) ^ worker_mul;
            for _ in 0..rounds {
                x0 = xround(x0);
                x1 = xround(x1);
                x2 = xround(x2);
                x3 = xround(x3);
            }
            xor0 ^= x0;
            sum0 = sum0.wrapping_add(x0 as u64);
            xor1 ^= x1;
            sum1 = sum1.wrapping_add(x1 as u64);
            xor2 ^= x2;
            sum2 = sum2.wrapping_add(x2 as u64);
            xor3 ^= x3;
            sum3 = sum3.wrapping_add(x3 as u64);
            item += 4;
        }
        let mut xor_t: u32 = 0;
        let mut sum_t: u64 = 0;
        while item < items {
            let mut x = phase_seed ^ base.wrapping_add(item as u32) ^ worker_mul;
            for _ in 0..rounds {
                x = xround(x);
            }
            xor_t ^= x;
            sum_t = sum_t.wrapping_add(x as u64);
            item += 1;
        }
        slot.xor
            .store(xor0 ^ xor1 ^ xor2 ^ xor3 ^ xor_t, Ordering::Relaxed);
        slot.sum.store(
            sum0
                .wrapping_add(sum1)
                .wrapping_add(sum2)
                .wrapping_add(sum3)
                .wrapping_add(sum_t),
            Ordering::Relaxed,
        );

        complete.wait();
    }
    // Coordinator waits in complete after the stop dispatch.
    complete.wait();
}

fn kernel(slots: &[Slot], dispatch: &Barrier, complete: &Barrier, input: &Input, mut phase_seed: u32) -> Output {
    let mut digest: u64 = 0x6a09e667f3bcc909;

    for phase in 0..input.phase_count {
        for w in 0..input.worker_count {
            slots[w].seed.store(phase_seed, Ordering::Relaxed);
        }
        dispatch.wait();
        complete.wait();

        let mut next_seed = phase_seed ^ (phase as u32);
        let mut phase_sum: u64 = 0;
        for w in 0..input.worker_count {
            let lx = slots[w].xor.load(Ordering::Relaxed);
            let ls = slots[w].sum.load(Ordering::Relaxed);
            next_seed = mix32(
                next_seed ^ lx ^ (ls as u32) ^ ((ls >> 32) as u32) ^ (w as u32),
            );
            phase_sum = phase_sum.wrapping_add(ls);
        }

        phase_seed = next_seed;
        digest = digest.rotate_left(7);
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

    let slots: Arc<Vec<Slot>> = Arc::new((0..input.worker_count).map(|_| Slot::new()).collect());
    let dispatch = Arc::new(Barrier::new(input.worker_count + 1));
    let complete = Arc::new(Barrier::new(input.worker_count + 1));
    let stopping = Arc::new(AtomicBool::new(false));

    let mut handles = Vec::with_capacity(input.worker_count);
    for w in 0..input.worker_count {
        let (slots, dispatch, complete, stopping) =
            (slots.clone(), dispatch.clone(), complete.clone(), stopping.clone());
        let (items, rounds) = (input.items_per_worker, input.rounds_per_item);
        handles.push(thread::spawn(move || {
            worker_body(w, items, rounds, &slots, &dispatch, &complete, &stopping)
        }));
    }

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
                let output = kernel(&slots, &dispatch, &complete, &input, seed_value);
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

    stopping.store(true, Ordering::Relaxed);
    dispatch.wait();
    complete.wait();
    for h in handles {
        h.join().unwrap();
    }
}
