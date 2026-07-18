use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{collections::HashMap, env, fs};

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
#[derive(Serialize)]
#[allow(non_snake_case)]
struct Checksum<'a> { Categories: &'a [Category], TopAccounts: &'a [Account] }
fn argument(name: &str) -> String {
    let args: Vec<String> = env::args().collect();
    args[args.iter().position(|x| x == name).expect("missing argument") + 1].clone()
}
fn main() {
    let mut reader = csv::Reader::from_path(argument("--input")).unwrap();
    let mut categories: HashMap<String, (i64, i64)> = HashMap::new();
    let mut accounts: HashMap<String, i64> = HashMap::new();
    let mut count = 0; let mut total_quantity = 0; let mut total_value = 0;
    let mut minimum = i64::MAX; let mut maximum = 0;
    for row in reader.records() {
        let row = row.unwrap(); let account = row[1].to_string(); let category = row[2].to_string();
        let quantity: i64 = row[3].parse().unwrap(); let value = quantity * row[4].parse::<i64>().unwrap();
        count += 1; total_quantity += quantity; total_value += value;
        minimum = minimum.min(value); maximum = maximum.max(value);
        let entry = categories.entry(category).or_default(); entry.0 += quantity; entry.1 += value;
        *accounts.entry(account).or_default() += value;
    }
    let mut categories: Vec<Category> = categories.into_iter().map(|(category, (quantity, value_minor_units))| Category { category, quantity, value_minor_units }).collect();
    categories.sort_by(|a,b| a.category.cmp(&b.category));
    let mut top_accounts: Vec<Account> = accounts.into_iter().map(|(account_id, value_minor_units)| Account { account_id, value_minor_units }).collect();
    top_accounts.sort_by(|a,b| b.value_minor_units.cmp(&a.value_minor_units).then(a.account_id.cmp(&b.account_id)));
    top_accounts.truncate(10);
    let mut encoded = serde_json::to_vec(&Checksum { Categories: &categories, TopAccounts: &top_accounts }).unwrap();
    encoded.push(b'\n');
    let checksum = format!("{:x}", Sha256::digest(encoded));
    let output = Output { benchmark: "aggregation", version: 1, record_count: count, total_quantity,
        total_value_minor_units: total_value, categories, top_accounts, minimum_transaction_minor_units: minimum,
        maximum_transaction_minor_units: maximum, checksum };
    fs::write(argument("--output"), serde_json::to_vec(&output).unwrap()).unwrap();
}
