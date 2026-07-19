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
        let start = Instant::now();
        output = Some(kernel(&input));
        let elapsed = start.elapsed().as_nanos() as u64;
        if i >= 0 {
            kernel_times.push(elapsed);
            samples.push(Sample { iteration: samples.len() + 1, kernel_time_nanoseconds: elapsed });
            if kernel_times.len() as isize >= max_iterations
                || (kernel_times.len() as isize >= min_iterations && ci_width(&kernel_times) <= target_ci)
            {
                break;
            }
        }
        i += 1;
    }
    let output = output.unwrap();
    fs::write(argument("--output"), serde_json::to_vec(&output).unwrap()).unwrap();
    fs::write(argument("--timing-output"), serde_json::to_vec(&serde_json::json!({"samples": samples})).unwrap()).unwrap();
}
