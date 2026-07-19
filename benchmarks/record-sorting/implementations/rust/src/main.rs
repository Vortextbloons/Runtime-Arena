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

fn main() {
    let input: Input = serde_json::from_str(&fs::read_to_string(argument("--input")).unwrap()).unwrap();
    let warmups: isize = argument("--warmup").parse().unwrap();
    let iterations: isize = argument("--iterations").parse().unwrap();
    let mut samples = vec![];
    let mut output = None;

    for i in -warmups..iterations {
        let records = input.records.clone();
        let start = Instant::now();
        output = Some(kernel(records));
        let elapsed = start.elapsed().as_nanos() as u64;
        if i >= 0 {
            samples.push(Sample {
                iteration: i as usize + 1,
                kernel_time_nanoseconds: elapsed,
            });
        }
    }

    let output = output.unwrap();
    fs::write(argument("--output"), serde_json::to_vec(&output).unwrap()).unwrap();
    fs::write(
        argument("--timing-output"),
        serde_json::to_vec(&serde_json::json!({"samples": samples})).unwrap(),
    )
    .unwrap();
}
