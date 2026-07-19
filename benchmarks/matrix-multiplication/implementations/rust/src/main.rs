use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{env, fs, time::Instant};

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
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Sample { iteration: usize, kernel_time_nanoseconds: u64 }
fn argument(name: &str) -> String {
    let args: Vec<String> = env::args().collect();
    args.get(args.iter().position(|x| x == name).expect("missing argument") + 1)
        .expect("missing value").clone()
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
    let input: Input = serde_json::from_str(&fs::read_to_string(argument("--input")).unwrap()).unwrap();
    let warmups: isize = argument("--warmup").parse().unwrap();
    let iterations: isize = argument("--iterations").parse().unwrap();
    let mut samples = vec![];
    let mut output = None;
    for i in -warmups..iterations {
        let start = Instant::now();
        output = Some(kernel(&input));
        let elapsed = start.elapsed().as_nanos() as u64;
        if i >= 0 { samples.push(Sample { iteration: i as usize + 1, kernel_time_nanoseconds: elapsed }); }
    }
    let output = output.unwrap();
    fs::write(argument("--output"), serde_json::to_vec(&output).unwrap()).unwrap();
    fs::write(argument("--timing-output"), serde_json::to_vec(&serde_json::json!({"samples": samples})).unwrap()).unwrap();
}
