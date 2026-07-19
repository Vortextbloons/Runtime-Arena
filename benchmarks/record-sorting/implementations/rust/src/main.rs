use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{env, fs, time::Instant};

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Sample {
    iteration: usize,
    kernel_time_nanoseconds: u64,
}

fn argument(name: &str) -> String {
    let args: Vec<String> = env::args().collect();
    args.get(args.iter().position(|x| x == name).expect("missing argument") + 1)
        .expect("missing value")
        .clone()
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

const T: [f64; 30] = [0., 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045];
fn ci_width(samples: &[u64]) -> f64 {
    let n = samples.len();
    if n < 2 { return f64::INFINITY; }
    let mean = samples.iter().map(|v| *v as f64).sum::<f64>() / n as f64;
    if mean <= 0.0 { return f64::INFINITY; }
    let var = samples.iter().map(|v| { let d = *v as f64 - mean; d * d }).sum::<f64>() / (n as f64 - 1.0);
    let t = if n < T.len() { T[n] } else { 2.0 };
    (2.0 * t * (var / n as f64).sqrt()) / mean
}

fn main() {
    let input: Input = serde_json::from_str(&fs::read_to_string(argument("--input")).unwrap()).unwrap();
    let warmups: isize = argument("--warmup").parse().unwrap();
    let min_iterations: isize = argument("--min-iterations").parse().unwrap();
    let max_iterations: isize = argument("--max-iterations").parse().unwrap();
    let target_ci: f64 = argument("--target-relative-ci").parse().unwrap();
    let mut samples = vec![];
    let mut output = None;

    let mut kernel_times = vec![];
    let mut i = -warmups;
    loop {
        let records = input.records.clone();
        let start = Instant::now();
        output = Some(kernel(records));
        let elapsed = start.elapsed().as_nanos() as u64;
        if i >= 0 {
            kernel_times.push(elapsed);
            samples.push(Sample { iteration: samples.len() + 1, kernel_time_nanoseconds: elapsed });
            if kernel_times.len() as isize >= max_iterations || (kernel_times.len() as isize >= min_iterations && ci_width(&kernel_times) <= target_ci) {
                break;
            }
        }
        i += 1;
    }

    let output = output.unwrap();
    fs::write(argument("--output"), serde_json::to_vec(&output).unwrap()).unwrap();
    fs::write(
        argument("--timing-output"),
        serde_json::to_vec(&serde_json::json!({"samples": samples})).unwrap(),
    )
    .unwrap();
}
