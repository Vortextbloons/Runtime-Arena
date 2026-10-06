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

struct Csr {
    offsets: Vec<usize>,
    dst: Vec<usize>,
    wgt: Vec<i64>,
    n: usize,
}

fn build_csr(input: &Input) -> Csr {
    let n = input.vertex_count;
    let mut degree = vec![0usize; n];
    for e in &input.edges {
        degree[e.from] += 1;
    }
    let mut offsets = vec![0usize; n + 1];
    for v in 0..n {
        offsets[v + 1] = offsets[v] + degree[v];
    }
    let mut dst = vec![0usize; input.edges.len()];
    let mut wgt = vec![0i64; input.edges.len()];
    let mut fill: Vec<usize> = offsets[..n].to_vec();
    for e in &input.edges {
        let s = fill[e.from];
        fill[e.from] = s + 1;
        dst[s] = e.to;
        wgt[s] = e.weight;
    }
    Csr { offsets, dst, wgt, n }
}

struct Runner {
    csr: Csr,
    // queries grouped by source: (source, member query indices)
    groups: Vec<(usize, Vec<usize>)>,
    qid: Vec<u32>,
    qdst: Vec<usize>,
    dist: Vec<i64>,
    prev: Vec<usize>,
    seen: Vec<u32>,
    tmark: Vec<u32>,
    epoch: u32,
    tepoch: u32,
    heap: BinaryHeap<Reverse<(i64, usize)>>,
    scratch: Vec<usize>,
}

impl Runner {
    fn new(input: &Input, csr: Csr) -> Self {
        let qn = input.queries.len();
        let mut qid = vec![0u32; qn];
        let mut qdst = vec![0usize; qn];
        let mut order: Vec<usize> = Vec::new();
        let mut map: Vec<Vec<usize>> = Vec::new();
        let mut src_of: Vec<usize> = Vec::new();
        // simple map via linear search over distinct sources (few hundred)
        for (i, q) in input.queries.iter().enumerate() {
            qid[i] = q.id;
            qdst[i] = q.destination;
            let mut found = None;
            for (gi, s) in src_of.iter().enumerate() {
                if *s == q.source {
                    found = Some(gi);
                    break;
                }
            }
            match found {
                Some(gi) => map[gi].push(i),
                None => {
                    src_of.push(q.source);
                    map.push(vec![i]);
                    order.push(q.source);
                }
            }
        }
        let groups: Vec<(usize, Vec<usize>)> = order.into_iter().zip(map.into_iter()).collect();
        let n = csr.n;
        Runner {
            csr,
            groups,
            qid,
            qdst,
            dist: vec![0i64; n],
            prev: vec![usize::MAX; n],
            seen: vec![0u32; n],
            tmark: vec![0u32; n],
            epoch: 0,
            tepoch: 0,
            heap: BinaryHeap::with_capacity(n * 2),
            scratch: Vec::with_capacity(16),
        }
    }

    fn kernel(&mut self) -> Vec<ResultRow> {
        let qn = self.qid.len();
        let mut out_dist: Vec<Option<i64>> = vec![None; qn];
        let mut out_path: Vec<Vec<usize>> = vec![Vec::new(); qn];
        for gi in 0..self.groups.len() {
            let src = self.groups[gi].0;
            self.scratch.clear();
            self.scratch.extend_from_slice(&self.groups[gi].1);
            self.epoch = self.epoch.wrapping_add(1);
            let cur = self.epoch;
            self.tepoch = self.tepoch.wrapping_add(1);
            if self.tepoch == 0 {
                self.tmark.fill(0);
                self.tepoch = 1;
            }
            let tc = self.tepoch;
            let mut rem = 0u32;
            for k in 0..self.scratch.len() {
                let qi = self.scratch[k];
                let d = self.qdst[qi];
                if d != src && self.tmark[d] != tc {
                    self.tmark[d] = tc;
                    rem += 1;
                }
            }
            self.dist[src] = 0;
            self.seen[src] = cur;
            self.prev[src] = usize::MAX;
            self.heap.clear();
            self.heap.push(Reverse((0i64, src)));
            while let Some(Reverse((cost, node))) = self.heap.pop() {
                if rem == 0 {
                    break;
                }
                if self.seen[node] != cur || cost != self.dist[node] {
                    continue;
                }
                if self.tmark[node] == tc {
                    self.tmark[node] = 0; // consume (0 never equals a live tc)
                    rem -= 1;
                    if rem == 0 {
                        break;
                    }
                }
                let base = self.csr.offsets[node];
                let end = self.csr.offsets[node + 1];
                for ei in base..end {
                    let to = self.csr.dst[ei];
                    let next = cost + self.csr.wgt[ei];
                    if self.seen[to] != cur || next < self.dist[to] {
                        self.seen[to] = cur;
                        self.dist[to] = next;
                        self.prev[to] = node;
                        self.heap.push(Reverse((next, to)));
                    }
                }
            }
            for k in 0..self.scratch.len() {
                let qi = self.scratch[k];
                let d = self.qdst[qi];
                if d == src {
                    out_dist[qi] = Some(0);
                    out_path[qi] = vec![src];
                } else if self.seen[d] != cur {
                    out_dist[qi] = None;
                    out_path[qi] = Vec::new();
                } else {
                    out_dist[qi] = Some(self.dist[d]);
                    let mut path = Vec::new();
                    let mut x = d;
                    loop {
                        path.push(x);
                        if x == src {
                            break;
                        }
                        x = self.prev[x];
                    }
                    path.reverse();
                    out_path[qi] = path;
                }
            }
        }
        let mut rows = Vec::with_capacity(qn);
        for i in 0..qn {
            rows.push(ResultRow {
                query_id: self.qid[i],
                distance: out_dist[i],
                path: std::mem::take(&mut out_path[i]),
            });
        }
        rows
    }
}

fn main() {
    assert_eq!(argument("--protocol-version"), PROTOCOL_VERSION);
    let output_path = argument("--output");
    let input: Input =
        serde_json::from_str(&fs::read_to_string(argument("--input")).unwrap()).unwrap();
    let csr = build_csr(&input);
    let mut runner = Runner::new(&input, csr);

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
                let results = runner.kernel();
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
