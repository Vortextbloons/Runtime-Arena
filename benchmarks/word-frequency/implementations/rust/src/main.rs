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

fn main() {
    let input: Input = serde_json::from_str(&fs::read_to_string(argument("--input")).unwrap()).unwrap();
    let warmups: isize = argument("--warmup").parse().unwrap();
    let iterations: isize = argument("--iterations").parse().unwrap();
    let mut samples = vec![];
    let mut output = None;

    for i in -warmups..iterations {
        let start = Instant::now();
        output = Some(kernel(&input.words));
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
