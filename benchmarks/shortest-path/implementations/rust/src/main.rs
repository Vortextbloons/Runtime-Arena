use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::cmp::Reverse;
use std::collections::BinaryHeap;
use std::io::{BufRead, BufReader, Write};
use std::{env, fs};

const PROTOCOL_VERSION: &str = "2.0.0";

#[derive(Clone, Deserialize)]
struct Edge {
    from: usize,
    to: usize,
    weight: i64,
}
#[derive(Deserialize)]
struct Query {
    id: u32,
    source: usize,
    destination: usize,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Input {
    vertex_count: usize,
    edges: Vec<Edge>,
    queries: Vec<Query>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResultRow {
    query_id: u32,
    distance: Option<i64>,
    path: Vec<usize>,
}
#[derive(Serialize)]
struct Output {
    benchmark: &'static str,
    version: u32,
    results: Vec<ResultRow>,
}

fn argument(name: &str) -> String {
    let args: Vec<String> = env::args().collect();
    args[args.iter().position(|x| x == name).expect("missing argument") + 1].clone()
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

fn build_adjacency(input: &Input) -> Vec<Vec<Edge>> {
    let mut adjacency = vec![Vec::new(); input.vertex_count];
    for edge in &input.edges {
        adjacency[edge.from].push(edge.clone());
    }
    adjacency
}

fn kernel(adjacency: &[Vec<Edge>], input: &Input) -> Vec<ResultRow> {
    input
        .queries
        .iter()
        .map(|query| {
            let mut distance = vec![i64::MAX; input.vertex_count];
            let mut previous = vec![usize::MAX; input.vertex_count];
            let mut queue = BinaryHeap::new();
            distance[query.source] = 0;
            queue.push(Reverse((0_i64, query.source)));
            while let Some(Reverse((cost, node))) = queue.pop() {
                if cost != distance[node] {
                    continue;
                }
                if node == query.destination {
                    break;
                }
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
                ResultRow {
                    query_id: query.id,
                    distance: None,
                    path: vec![],
                }
            } else {
                let mut path = vec![];
                let mut node = query.destination;
                loop {
                    path.push(node);
                    if node == query.source {
                        break;
                    }
                    node = previous[node];
                }
                path.reverse();
                ResultRow {
                    query_id: query.id,
                    distance: Some(distance[query.destination]),
                    path,
                }
            }
        })
        .collect()
}

fn main() {
    assert_eq!(argument("--protocol-version"), PROTOCOL_VERSION);
    let output_path = argument("--output");
    let input: Input =
        serde_json::from_str(&fs::read_to_string(argument("--input")).unwrap()).unwrap();
    let adjacency = build_adjacency(&input);

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
                let results = kernel(&adjacency, &input);
                let output = Output {
                    benchmark: "shortest-path",
                    version: 1,
                    results,
                };
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
