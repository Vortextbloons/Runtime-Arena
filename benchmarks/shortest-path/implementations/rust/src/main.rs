use serde::{Deserialize, Serialize};
use std::{cmp::Reverse, collections::BinaryHeap, env, fs, time::Instant};

#[derive(Clone, Deserialize)]
struct Edge { from: usize, to: usize, weight: i64 }
#[derive(Deserialize)]
struct Query { id: u32, source: usize, destination: usize }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Input { vertex_count: usize, edges: Vec<Edge>, queries: Vec<Query> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResultRow { query_id: u32, distance: Option<i64>, path: Vec<usize> }
#[derive(Serialize)]
struct Output { benchmark: &'static str, version: u32, results: Vec<ResultRow> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Sample { iteration: usize, kernel_time_nanoseconds: u64 }
fn argument(name: &str) -> String {
    let args: Vec<String> = env::args().collect();
    args[args.iter().position(|x| x == name).expect("missing argument") + 1].clone()
}
fn build_adjacency(input: &Input) -> Vec<Vec<Edge>> {
    let mut adjacency = vec![Vec::new(); input.vertex_count];
    for edge in &input.edges { adjacency[edge.from].push(edge.clone()); }
    adjacency
}

fn kernel(adjacency: &[Vec<Edge>], input: &Input) -> Vec<ResultRow> {
    input.queries.iter().map(|query| {
        let mut distance = vec![i64::MAX; input.vertex_count];
        let mut previous = vec![usize::MAX; input.vertex_count];
        let mut queue = BinaryHeap::new();
        distance[query.source] = 0;
        queue.push(Reverse((0_i64, query.source)));
        while let Some(Reverse((cost, node))) = queue.pop() {
            if cost != distance[node] { continue; }
            for edge in &adjacency[node] {
                let next = cost + edge.weight;
                if next < distance[edge.to] {
                    distance[edge.to] = next;
                    previous[edge.to] = node;
                    queue.push(Reverse((next, edge.to)));
                }
            }
        }
        if distance[query.destination] == i64::MAX {
            ResultRow { query_id: query.id, distance: None, path: vec![] }
        } else {
            let mut path = vec![];
            let mut node = query.destination;
            loop {
                path.push(node);
                if node == query.source { break; }
                node = previous[node];
            }
            path.reverse();
            ResultRow { query_id: query.id, distance: Some(distance[query.destination]), path }
        }
    }).collect()
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
    let adjacency = build_adjacency(&input);
    let warmups: isize = argument("--warmup").parse().unwrap(); let min_iterations: isize = argument("--min-iterations").parse().unwrap(); let max_iterations: isize = argument("--max-iterations").parse().unwrap(); let target_ci: f64 = argument("--target-relative-ci").parse().unwrap();
    let mut samples = vec![]; let mut results = vec![];
    let mut kernel_times = vec![];
    let mut i = -warmups;
    loop {
         let start = Instant::now(); results = kernel(&adjacency, &input); let elapsed = start.elapsed().as_nanos() as u64;
        if i >= 0 { kernel_times.push(elapsed); samples.push(Sample { iteration: samples.len() + 1, kernel_time_nanoseconds: elapsed });
            if kernel_times.len() as isize >= max_iterations || (kernel_times.len() as isize >= min_iterations && ci_width(&kernel_times) <= target_ci) { break; }
        }
        i += 1;
    }
    fs::write(argument("--output"), serde_json::to_vec(&Output { benchmark: "shortest-path", version: 1, results }).unwrap()).unwrap();
    fs::write(argument("--timing-output"), serde_json::to_vec(&serde_json::json!({"samples": samples})).unwrap()).unwrap();
}
