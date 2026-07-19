use rustc_hash::{FxHashMap, FxBuildHasher};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{env, fs, time::Instant};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Category { category: String, quantity: i64, value_minor_units: i64 }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Account { account_id: String, value_minor_units: i64 }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Output {
    benchmark: &'static str, version: u32, record_count: usize, total_quantity: i64,
    total_value_minor_units: i64, categories: Vec<Category>, top_accounts: Vec<Account>,
    minimum_transaction_minor_units: i64, maximum_transaction_minor_units: i64, checksum: String,
}
#[derive(Clone)]
struct Row { account: String, category: String, quantity: i64, price: i64 }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Sample { iteration: usize, kernel_time_nanoseconds: u64 }

fn argument(name: &str) -> String {
    let args: Vec<String> = env::args().collect();
    args[args.iter().position(|x| x == name).expect("missing argument") + 1].clone()
}

fn write_i64(buf: &mut Vec<u8>, mut v: i64) {
    if v == 0 { buf.push(b'0'); return; }
    if v < 0 { buf.push(b'-'); v = -v; }
    let mut digits = [0u8; 20];
    let mut i = 20;
    while v > 0 { i -= 1; digits[i] = b'0' + (v % 10) as u8; v /= 10; }
    buf.extend_from_slice(&digits[i..]);
}

fn kernel(rows: &[Row]) -> Output {
    let mut categories: FxHashMap<&str, (i64, i64)> = FxHashMap::with_capacity_and_hasher(64, FxBuildHasher);
    let mut accounts: FxHashMap<&str, i64> = FxHashMap::with_capacity_and_hasher(512, FxBuildHasher);
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
        if value < minimum { minimum = value; }
        if value > maximum { maximum = value; }
        let cat_entry = categories.entry(row.category.as_str()).or_default();
        cat_entry.0 += row.quantity;
        cat_entry.1 += value;
        *accounts.entry(row.account.as_str()).or_default() += value;
    }

    let mut cat_vec: Vec<(&str, i64, i64)> = categories.into_iter()
        .map(|(k, (q, v))| (k, q, v))
        .collect();
    cat_vec.sort_unstable_by(|a, b| a.0.cmp(b.0));

    let mut acc_vec: Vec<(&str, i64)> = accounts.into_iter().collect();
    if acc_vec.len() > 10 {
        acc_vec.select_nth_unstable_by(10, |a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(b.0)));
        acc_vec.truncate(10);
    }
    acc_vec.sort_unstable_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(b.0)));

    let mut checksum_buf = Vec::with_capacity(512);
    checksum_buf.extend_from_slice(b"{\"Categories\":[");
    for (i, &(cat, qty, val)) in cat_vec.iter().enumerate() {
        if i > 0 { checksum_buf.push(b','); }
        checksum_buf.extend_from_slice(b"{\"category\":\"");
        checksum_buf.extend_from_slice(cat.as_bytes());
        checksum_buf.extend_from_slice(b"\",\"quantity\":");
        write_i64(&mut checksum_buf, qty);
        checksum_buf.extend_from_slice(b",\"valueMinorUnits\":");
        write_i64(&mut checksum_buf, val);
        checksum_buf.push(b'}');
    }
    checksum_buf.extend_from_slice(b"],\"TopAccounts\":[");
    for (i, &(acc, val)) in acc_vec.iter().enumerate() {
        if i > 0 { checksum_buf.push(b','); }
        checksum_buf.extend_from_slice(b"{\"accountId\":\"");
        checksum_buf.extend_from_slice(acc.as_bytes());
        checksum_buf.extend_from_slice(b"\",\"valueMinorUnits\":");
        write_i64(&mut checksum_buf, val);
        checksum_buf.push(b'}');
    }
    checksum_buf.extend_from_slice(b"]}");
    checksum_buf.push(b'\n');

    let hash = Sha256::digest(&checksum_buf);
    let checksum = {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        let mut s = String::with_capacity(64);
        for &b in hash.as_slice() {
            s.push(HEX[(b >> 4) as usize] as char);
            s.push(HEX[(b & 0xf) as usize] as char);
        }
        s
    };

    let categories = cat_vec.into_iter()
        .map(|(cat, qty, val)| Category { category: cat.to_owned(), quantity: qty, value_minor_units: val })
        .collect();
    let top_accounts = acc_vec.into_iter()
        .map(|(acc, val)| Account { account_id: acc.to_owned(), value_minor_units: val })
        .collect();

    Output {
        benchmark: "aggregation", version: 1, record_count: count,
        total_quantity, total_value_minor_units: total_value,
        categories, top_accounts,
        minimum_transaction_minor_units: minimum,
        maximum_transaction_minor_units: maximum, checksum,
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
    let mut reader = csv::Reader::from_path(argument("--input")).unwrap();
    let rows: Vec<Row> = reader.records().map(|row| { let row = row.unwrap(); Row { account: row[1].to_string(),
        category: row[2].to_string(), quantity: row[3].parse().unwrap(), price: row[4].parse().unwrap() } }).collect();
    let warmups: isize = argument("--warmup").parse().unwrap(); let min_iterations: isize = argument("--min-iterations").parse().unwrap(); let max_iterations: isize = argument("--max-iterations").parse().unwrap(); let target_ci: f64 = argument("--target-relative-ci").parse().unwrap();
    let mut samples = vec![]; let mut output = None;
    let mut kernel_times = vec![];
    let mut i = -warmups;
    loop {
         let start = Instant::now(); output = Some(kernel(&rows)); let elapsed = start.elapsed().as_nanos() as u64;
        if i >= 0 { kernel_times.push(elapsed); samples.push(Sample { iteration: samples.len() + 1, kernel_time_nanoseconds: elapsed });
            if kernel_times.len() as isize >= max_iterations || (kernel_times.len() as isize >= min_iterations && ci_width(&kernel_times) <= target_ci) { break; }
        }
        i += 1;
    }
    fs::write(argument("--output"), serde_json::to_vec(&output).unwrap()).unwrap();
    fs::write(argument("--timing-output"), serde_json::to_vec(&serde_json::json!({"samples": samples})).unwrap()).unwrap();
}
