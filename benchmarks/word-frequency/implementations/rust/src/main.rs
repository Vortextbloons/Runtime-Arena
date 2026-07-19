use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, env, fs, time::Instant};

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

fn kernel(words: &[String]) -> Output {
    let mut freq: HashMap<&str, usize> = HashMap::new();
    for w in words {
        *freq.entry(w.as_str()).or_insert(0) += 1;
    }

    let mut entries: Vec<(&str, usize)> = freq.into_iter().collect();
    entries.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(b.0)));

    let mut hasher = Sha256::new();
    for (word, count) in &entries {
        hasher.update(format!("{word},{count}\n"));
    }

    let top_words: Vec<TopWord> = entries
        .iter()
        .take(10)
        .map(|(w, c)| TopWord { word: w.to_string(), count: *c })
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
        output = Some(kernel(&input.words));
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
