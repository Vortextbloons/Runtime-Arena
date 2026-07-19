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
fn kernel(input: &Input) -> Vec<ResultRow> {
    let mut adjacency = vec![Vec::new(); input.vertex_count];
    for edge in &input.edges { adjacency[edge.from].push(edge); }
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
fn main() {
    let input: Input = serde_json::from_str(&fs::read_to_string(argument("--input")).unwrap()).unwrap();
    let warmups: isize = argument("--warmup").parse().unwrap(); let iterations: isize = argument("--iterations").parse().unwrap();
    let mut samples = vec![]; let mut results = vec![];
    for i in -warmups..iterations { let start = Instant::now(); results = kernel(&input); let elapsed = start.elapsed().as_nanos() as u64;
        if i >= 0 { samples.push(Sample { iteration: i as usize + 1, kernel_time_nanoseconds: elapsed }); } }
    fs::write(argument("--output"), serde_json::to_vec(&Output { benchmark: "shortest-path", version: 1, results }).unwrap()).unwrap();
    fs::write(argument("--timing-output"), serde_json::to_vec(&serde_json::json!({"samples": samples})).unwrap()).unwrap();
}
