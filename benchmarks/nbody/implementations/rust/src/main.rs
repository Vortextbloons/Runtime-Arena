use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{env, fs};

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
        .expect("missing value").clone()
}
fn main() {
    let input: Input = serde_json::from_str(&fs::read_to_string(argument("--input")).unwrap()).unwrap();
    let mut bodies = input.bodies;
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
    let output = Output { benchmark: "nbody", version: 1, body_count: bodies.len(), final_energy: energy,
        position_checksum: format!("{:x}", positions.finalize()), velocity_checksum: format!("{:x}", velocities.finalize()) };
    fs::write(argument("--output"), serde_json::to_vec(&output).unwrap()).unwrap();
}
