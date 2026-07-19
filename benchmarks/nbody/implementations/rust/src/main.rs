use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{env, fs, time::Instant};

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
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Sample { iteration: usize, kernel_time_nanoseconds: u64 }
fn argument(name: &str) -> String {
    let args: Vec<String> = env::args().collect();
    args.get(args.iter().position(|x| x == name).expect("missing argument") + 1)
        .expect("missing value").clone()
}
fn kernel(input: &Input, mut bodies: Vec<Body>) -> Output {
    for _ in 0..input.steps {
        for i in 0..bodies.len() {
            for j in i + 1..bodies.len() {
                let d = [
                    bodies[j].position[0] - bodies[i].position[0],
                    bodies[j].position[1] - bodies[i].position[1],
                    bodies[j].position[2] - bodies[i].position[2],
                ];
                let r2: f64 = d.iter().map(|x| x * x).sum();
                let magnitude = input.delta_time / (r2 * r2.sqrt());
                for (k, delta) in d.iter().enumerate() {
                    bodies[i].velocity[k] += delta * bodies[j].mass * magnitude;
                    bodies[j].velocity[k] -= delta * bodies[i].mass * magnitude;
                }
            }
        }
        for body in &mut bodies {
            for k in 0..3 { body.position[k] += input.delta_time * body.velocity[k]; }
        }
    }
    let mut energy = 0.0;
    let mut positions = Sha256::new();
    let mut velocities = Sha256::new();
    for i in 0..bodies.len() {
        energy += 0.5 * bodies[i].mass * bodies[i].velocity.iter().map(|x| x*x).sum::<f64>();
        for k in 0..3 {
            positions.update(format!("{:.9},", bodies[i].position[k]));
            velocities.update(format!("{:.9},", bodies[i].velocity[k]));
        }
        for j in i + 1..bodies.len() {
            let r2: f64 = (0..3).map(|k| (bodies[i].position[k] - bodies[j].position[k]).powi(2)).sum();
            energy -= bodies[i].mass * bodies[j].mass / r2.sqrt();
        }
    }
    Output { benchmark: "nbody", version: 1, body_count: bodies.len(), final_energy: energy,
        position_checksum: format!("{:x}", positions.finalize()), velocity_checksum: format!("{:x}", velocities.finalize()) }
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
    let mut samples = vec![]; let mut output = None;
    let mut kernel_times = vec![];
    let mut i = -warmups;
    loop {
        let state = input.bodies.clone();
        let start = Instant::now();
        output = Some(kernel(&input, state));
        let elapsed = start.elapsed().as_nanos() as u64;
        if i >= 0 {
            kernel_times.push(elapsed);
            samples.push(Sample { iteration: samples.len() + 1, kernel_time_nanoseconds: elapsed });
            if kernel_times.len() as isize >= max_iterations
                || (kernel_times.len() as isize >= min_iterations && ci_width(&kernel_times) <= target_ci)
            {
                break;
            }
        }
        i += 1;
    }
    let output = output.unwrap();
    fs::write(argument("--output"), serde_json::to_vec(&output).unwrap()).unwrap();
    fs::write(argument("--timing-output"), serde_json::to_vec(&serde_json::json!({"samples": samples})).unwrap()).unwrap();
}
