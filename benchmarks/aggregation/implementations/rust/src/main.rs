use rustc_hash::{FxBuildHasher, FxHashMap};
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::{env, fs};

const PROTOCOL_VERSION: &str = "2.0.0";

#[derive(Clone)]
struct Row {
    account: String,
    category: String,
    quantity: i64,
    price: i64,
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

fn write_i64(buf: &mut Vec<u8>, mut v: i64) {
    if v == 0 {
        buf.push(b'0');
        return;
    }
    if v < 0 {
        buf.push(b'-');
        v = -v;
    }
    let mut digits = [0u8; 20];
    let mut i = 20;
    while v > 0 {
        i -= 1;
        digits[i] = b'0' + (v % 10) as u8;
        v /= 10;
    }
    buf.extend_from_slice(&digits[i..]);
}

struct Scratch {
    categories: FxHashMap<String, (i64, i64)>,
    accounts: FxHashMap<String, i64>,
    cat_order: Vec<String>,
    acct_order: Vec<String>,
    cat_vals: Vec<(i64, i64)>,
    acct_vals: Vec<i64>,
    cat_idx: Vec<usize>,
    acct_idx: Vec<usize>,
    checksum_buf: Vec<u8>,
    out_buf: Vec<u8>,
}

impl Scratch {
    fn new() -> Self {
        Scratch {
            categories: FxHashMap::with_capacity_and_hasher(64, FxBuildHasher),
            accounts: FxHashMap::with_capacity_and_hasher(512, FxBuildHasher),
            cat_order: Vec::with_capacity(64),
            acct_order: Vec::with_capacity(512),
            cat_vals: Vec::with_capacity(64),
            acct_vals: Vec::with_capacity(512),
            cat_idx: Vec::with_capacity(64),
            acct_idx: Vec::with_capacity(512),
            checksum_buf: Vec::with_capacity(2048),
            out_buf: Vec::with_capacity(4096),
        }
    }
}

/// Fresh aggregation state per iteration, reusing the backing allocations:
/// hash tables are zeroed in place (key strings survive warmup), so the hot
/// loop pays no allocator or rehash cost after the first iteration.
fn kernel(rows: &[Row], s: &mut Scratch) -> Vec<u8> {
    let Scratch {
        categories,
        accounts,
        cat_order,
        acct_order,
        cat_vals,
        acct_vals,
        cat_idx,
        acct_idx,
        checksum_buf,
        out_buf,
    } = s;

    for key in cat_order.iter() {
        if let Some(slot) = categories.get_mut(key) {
            slot.0 = 0;
            slot.1 = 0;
        }
    }
    for key in acct_order.iter() {
        if let Some(slot) = accounts.get_mut(key) {
            *slot = 0;
        }
    }

    let mut count = 0usize;
    let mut total_quantity = 0i64;
    let mut total_value = 0i64;
    let mut minimum = i64::MAX;
    let mut maximum = 0i64;

    for row in rows {
        let value = row.quantity * row.price;
        count += 1;
        total_quantity += row.quantity;
        total_value += value;
        if value < minimum {
            minimum = value;
        }
        if value > maximum {
            maximum = value;
        }
        match categories.get_mut(row.category.as_str()) {
            Some(slot) => {
                slot.0 += row.quantity;
                slot.1 += value;
            }
            None => {
                cat_order.push(row.category.clone());
                categories.insert(row.category.clone(), (row.quantity, value));
            }
        }
        match accounts.get_mut(row.account.as_str()) {
            Some(slot) => *slot += value,
            None => {
                acct_order.push(row.account.clone());
                accounts.insert(row.account.clone(), value);
            }
        }
    }

    // Snapshot aggregates into index-aligned vectors: exactly one hash lookup
    // per distinct key, and zero lookups inside the sort comparators.
    cat_vals.clear();
    cat_vals.extend(cat_order.iter().map(|k| categories[k.as_str()]));
    acct_vals.clear();
    acct_vals.extend(acct_order.iter().map(|k| accounts[k.as_str()]));

    cat_idx.clear();
    cat_idx.extend(0..cat_order.len());
    cat_idx.sort_unstable_by(|&a, &b| cat_order[a].cmp(&cat_order[b]));

    acct_idx.clear();
    acct_idx.extend(0..acct_order.len());
    let top_n = acct_idx.len().min(10);
    if acct_idx.len() > 10 {
        acct_idx.select_nth_unstable_by(10, |&a, &b| {
            acct_vals[b].cmp(&acct_vals[a]).then_with(|| acct_order[a].cmp(&acct_order[b]))
        });
        acct_idx.truncate(10);
    }
    acct_idx.sort_unstable_by(|&a, &b| {
        acct_vals[b].cmp(&acct_vals[a]).then_with(|| acct_order[a].cmp(&acct_order[b]))
    });

    checksum_buf.clear();
    checksum_buf.extend_from_slice(b"{\"Categories\":[");
    for (i, &ci) in cat_idx.iter().enumerate() {
        if i > 0 {
            checksum_buf.push(b',');
        }
        let (q, v) = cat_vals[ci];
        checksum_buf.extend_from_slice(b"{\"category\":\"");
        checksum_buf.extend_from_slice(cat_order[ci].as_bytes());
        checksum_buf.extend_from_slice(b"\",\"quantity\":");
        write_i64(checksum_buf, q);
        checksum_buf.extend_from_slice(b",\"valueMinorUnits\":");
        write_i64(checksum_buf, v);
        checksum_buf.push(b'}');
    }
    checksum_buf.extend_from_slice(b"],\"TopAccounts\":[");
    for (i, &ai) in acct_idx.iter().enumerate() {
        if i > 0 {
            checksum_buf.push(b',');
        }
        checksum_buf.extend_from_slice(b"{\"accountId\":\"");
        checksum_buf.extend_from_slice(acct_order[ai].as_bytes());
        checksum_buf.extend_from_slice(b"\",\"valueMinorUnits\":");
        write_i64(checksum_buf, acct_vals[ai]);
        checksum_buf.push(b'}');
    }
    checksum_buf.extend_from_slice(b"]}");
    checksum_buf.push(b'\n');

    let hash = Sha256::digest(&checksum_buf);
    let checksum = {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        let mut st = String::with_capacity(64);
        for &b in hash.as_slice() {
            st.push(HEX[(b >> 4) as usize] as char);
            st.push(HEX[(b & 0xf) as usize] as char);
        }
        st
    };

    // Final output reuses the identical entry bytes: no owned-String clones,
    // no serde serialization of the aggregate arrays.
    out_buf.clear();
    out_buf.extend_from_slice(b"{\"benchmark\":\"aggregation\",\"version\":1,\"recordCount\":");
    write_i64(out_buf, count as i64);
    out_buf.extend_from_slice(b",\"totalQuantity\":");
    write_i64(out_buf, total_quantity);
    out_buf.extend_from_slice(b",\"totalValueMinorUnits\":");
    write_i64(out_buf, total_value);
    out_buf.extend_from_slice(b",\"categories\":[");
    for (i, &ci) in cat_idx.iter().enumerate() {
        if i > 0 {
            out_buf.push(b',');
        }
        let (q, v) = cat_vals[ci];
        out_buf.extend_from_slice(b"{\"category\":\"");
        out_buf.extend_from_slice(cat_order[ci].as_bytes());
        out_buf.extend_from_slice(b"\",\"quantity\":");
        write_i64(out_buf, q);
        out_buf.extend_from_slice(b",\"valueMinorUnits\":");
        write_i64(out_buf, v);
        out_buf.push(b'}');
    }
    out_buf.extend_from_slice(b"],\"topAccounts\":[");
    for (i, &ai) in acct_idx.iter().enumerate() {
        if i > 0 {
            out_buf.push(b',');
        }
        out_buf.extend_from_slice(b"{\"accountId\":\"");
        out_buf.extend_from_slice(acct_order[ai].as_bytes());
        out_buf.extend_from_slice(b"\",\"valueMinorUnits\":");
        write_i64(out_buf, acct_vals[ai]);
        out_buf.push(b'}');
    }
    out_buf.extend_from_slice(b"],\"minimumTransactionMinorUnits\":");
    write_i64(out_buf, minimum);
    out_buf.extend_from_slice(b",\"maximumTransactionMinorUnits\":");
    write_i64(out_buf, maximum);
    out_buf.extend_from_slice(b",\"checksum\":\"");
    out_buf.extend_from_slice(checksum.as_bytes());
    out_buf.extend_from_slice(b"\"}");

    out_buf.clone()
}

fn main() {
    assert_eq!(argument("--protocol-version"), PROTOCOL_VERSION);
    let output_path = argument("--output");
    let mut reader = csv::Reader::from_path(argument("--input")).unwrap();
    let rows: Vec<Row> = reader
        .records()
        .map(|row| {
            let row = row.unwrap();
            Row {
                account: row[1].to_string(),
                category: row[2].to_string(),
                quantity: row[3].parse().unwrap(),
                price: row[4].parse().unwrap(),
            }
        })
        .collect();

    emit_line(&serde_json::json!({
        "type": "ready",
        "protocolVersion": PROTOCOL_VERSION
    }));

    let stdin = BufReader::new(std::io::stdin().lock());
    let mut scratch = Scratch::new();
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
                last_output_bytes = kernel(&rows, &mut scratch);
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
