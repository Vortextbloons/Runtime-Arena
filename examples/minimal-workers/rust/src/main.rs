use serde::Serialize;

#[derive(Serialize)]
struct Output {
    benchmark: &'static str,
    version: u32,
    value: u32,
}

fn main() {
    arena_protocol::run_worker(
        &arena_protocol::arg("--input"),
        &arena_protocol::arg("--output"),
        || Output {
            benchmark: "minimal",
            version: 1,
            value: 42,
        },
    );
}
