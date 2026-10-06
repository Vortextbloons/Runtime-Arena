use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::{env, fs};

const PROTOCOL_VERSION: &str = "2.0.0";

#[derive(Clone, Deserialize)]
struct Body {
    mass: f64,
    position: [f64; 3],
    velocity: [f64; 3],
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Input {
    steps: usize,
    delta_time: f64,
    bodies: Vec<Body>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Output {
    benchmark: &'static str,
    version: u32,
    body_count: usize,
    final_energy: f64,
    position_checksum: String,
    velocity_checksum: String,
}

fn argument(name: &str) -> String {
    let args: Vec<String> = env::args().collect();
    args.get(args.iter().position(|x| x == name).expect("missing argument") + 1)
        .expect("missing value")
        .clone()
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

fn kernel(input: &Input, bodies: &[Body]) -> Output {
    let n = bodies.len();
    let dt = input.delta_time;
    let mut mass = Vec::with_capacity(n);
    let mut px = Vec::with_capacity(n);
    let mut py = Vec::with_capacity(n);
    let mut pz = Vec::with_capacity(n);
    let mut vx = Vec::with_capacity(n);
    let mut vy = Vec::with_capacity(n);
    let mut vz = Vec::with_capacity(n);
    for b in bodies {
        mass.push(b.mass);
        px.push(b.position[0]);
        py.push(b.position[1]);
        pz.push(b.position[2]);
        vx.push(b.velocity[0]);
        vy.push(b.velocity[1]);
        vz.push(b.velocity[2]);
    }
    for _ in 0..input.steps {
        for i in 0..n {
            let pxi = px[i];
            let pyi = py[i];
            let pzi = pz[i];
            let mi = mass[i];
            let mut vxi = vx[i];
            let mut vyi = vy[i];
            let mut vzi = vz[i];
            for j in i + 1..n {
                let dx = px[j] - pxi;
                let dy = py[j] - pyi;
                let dz = pz[j] - pzi;
                let r2 = dx * dx + dy * dy + dz * dz;
                let magnitude = dt / (r2 * r2.sqrt());
                let mj = mass[j];
                vxi += dx * mj * magnitude;
                vyi += dy * mj * magnitude;
                vzi += dz * mj * magnitude;
                vx[j] -= dx * mi * magnitude;
                vy[j] -= dy * mi * magnitude;
                vz[j] -= dz * mi * magnitude;
            }
            vx[i] = vxi;
            vy[i] = vyi;
            vz[i] = vzi;
        }
        for i in 0..n {
            px[i] += dt * vx[i];
            py[i] += dt * vy[i];
            pz[i] += dt * vz[i];
        }
    }
    let mut energy = 0.0;
    for i in 0..n {
        energy += 0.5 * mass[i] * (vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i]);
        for j in i + 1..n {
            let dx = px[i] - px[j];
            let dy = py[i] - py[j];
            let dz = pz[i] - pz[j];
            energy -= mass[i] * mass[j] / (dx * dx + dy * dy + dz * dz).sqrt();
        }
    }
    use std::fmt::Write as _;
    let mut positions = String::with_capacity(n * 48);
    let mut velocities = String::with_capacity(n * 48);
    for i in 0..n {
        write!(positions, "{:.9},{:.9},{:.9},", px[i], py[i], pz[i]).unwrap();
        write!(velocities, "{:.9},{:.9},{:.9},", vx[i], vy[i], vz[i]).unwrap();
    }
    Output {
        benchmark: "nbody",
        version: 1,
        body_count: n,
        final_energy: energy,
        position_checksum: format!("{:x}", Sha256::digest(positions.as_bytes())),
        velocity_checksum: format!("{:x}", Sha256::digest(velocities.as_bytes())),
    }
}

fn main() {
    assert_eq!(argument("--protocol-version"), PROTOCOL_VERSION);
    let output_path = argument("--output");
    let input: Input =
        serde_json::from_str(&fs::read_to_string(argument("--input")).unwrap()).unwrap();

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
                let output = kernel(&input, &input.bodies);
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
