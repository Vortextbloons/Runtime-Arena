#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "json.hpp"
#include "sha256.hpp"

using json = nlohmann::json;

struct Body {
    double mass;
    std::array<double, 3> position;
    std::array<double, 3> velocity;
};

struct Input {
    int steps;
    double deltaTime;
    std::vector<Body> bodies;
};

struct Output {
    std::string benchmark;
    int version;
    int bodyCount;
    double finalEnergy;
    std::string positionChecksum;
    std::string velocityChecksum;
};

struct Sample {
    int iteration;
    int64_t kernelTimeNanoseconds;
};

Input parseInput(const json& j) {
    Input in;
    in.steps = j["steps"].get<int>();
    in.deltaTime = j["deltaTime"].get<double>();
    for (auto& b : j["bodies"]) {
        Body body;
        body.mass = b["mass"].get<double>();
        body.position = {b["position"][0].get<double>(), b["position"][1].get<double>(), b["position"][2].get<double>()};
        body.velocity = {b["velocity"][0].get<double>(), b["velocity"][1].get<double>(), b["velocity"][2].get<double>()};
        in.bodies.push_back(body);
    }
    return in;
}

Output kernel(const Input& in, std::vector<Body> bodies) {
    int n = static_cast<int>(bodies.size());
    double dt = in.deltaTime;

    for (int s = 0; s < in.steps; s++) {
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                std::array<double, 3> d;
                double r2 = 0.0;
                for (int k = 0; k < 3; k++) {
                    d[k] = bodies[j].position[k] - bodies[i].position[k];
                    r2 += d[k] * d[k];
                }
                double magnitude = dt / (r2 * std::sqrt(r2));
                for (int k = 0; k < 3; k++) {
                    bodies[i].velocity[k] += d[k] * bodies[j].mass * magnitude;
                    bodies[j].velocity[k] -= d[k] * bodies[i].mass * magnitude;
                }
            }
        }
        for (int i = 0; i < n; i++) {
            for (int k = 0; k < 3; k++) {
                bodies[i].position[k] += dt * bodies[i].velocity[k];
            }
        }
    }

    double energy = 0.0;
    for (int i = 0; i < n; i++) {
        double v2 = 0.0;
        for (int k = 0; k < 3; k++) {
            v2 += bodies[i].velocity[k] * bodies[i].velocity[k];
        }
        energy += 0.5 * bodies[i].mass * v2;
        for (int j = i + 1; j < n; j++) {
            double r2 = 0.0;
            for (int k = 0; k < 3; k++) {
                double diff = bodies[i].position[k] - bodies[j].position[k];
                r2 += diff * diff;
            }
            energy -= bodies[i].mass * bodies[j].mass / std::sqrt(r2);
        }
    }

    std::string positionData;
    std::string velocityData;
    for (auto& b : bodies) {
        for (int k = 0; k < 3; k++) {
            char buf[32];
            std::snprintf(buf, sizeof(buf), "%.9f,", b.position[k]);
            positionData += buf;
            std::snprintf(buf, sizeof(buf), "%.9f,", b.velocity[k]);
            velocityData += buf;
        }
    }

    SHA256 ph, vh;
    ph.update(positionData);
    vh.update(velocityData);

    Output out;
    out.benchmark = "nbody";
    out.version = 1;
    out.bodyCount = n;
    out.finalEnergy = energy;
    out.positionChecksum = ph.hex();
    out.velocityChecksum = vh.hex();
    return out;
}

std::string readFile(const std::string& path) {
    std::ifstream f(path);
    if (!f.is_open()) {
        std::cerr << "Failed to open input file: " << path << std::endl;
        std::exit(1);
    }
    std::ostringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

int main(int argc, char* argv[]) {
    std::string inputPath, outputPath, timingPath;
    int warmup = 0, iterations = 1;

    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--input" && i + 1 < argc) inputPath = argv[++i];
        else if (arg == "--output" && i + 1 < argc) outputPath = argv[++i];
        else if (arg == "--timing-output" && i + 1 < argc) timingPath = argv[++i];
        else if (arg == "--warmup" && i + 1 < argc) warmup = std::stoi(argv[++i]);
        else if (arg == "--iterations" && i + 1 < argc) iterations = std::stoi(argv[++i]);
    }

    if (inputPath.empty() || outputPath.empty() || timingPath.empty()) {
        std::cerr << "Usage: nbody --input <file> --output <file> --timing-output <file> [--warmup <n>] [--iterations <n>]" << std::endl;
        return 1;
    }

    json inputJson = json::parse(readFile(inputPath));
    Input in = parseInput(inputJson);

    std::vector<Sample> samples;
    Output out;

    for (int i = -warmup; i < iterations; i++) {
        std::vector<Body> bodiesCopy = in.bodies;

        auto start = std::chrono::high_resolution_clock::now();
        out = kernel(in, bodiesCopy);
        auto end = std::chrono::high_resolution_clock::now();

        int64_t elapsed = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count();
        if (elapsed < 1) elapsed = 1;

        if (i >= 0) {
            samples.push_back({i + 1, elapsed});
        }
    }

    json outputJson;
    outputJson["benchmark"] = out.benchmark;
    outputJson["version"] = out.version;
    outputJson["bodyCount"] = out.bodyCount;
    outputJson["finalEnergy"] = out.finalEnergy;
    outputJson["positionChecksum"] = out.positionChecksum;
    outputJson["velocityChecksum"] = out.velocityChecksum;

    std::ofstream outFile(outputPath);
    if (!outFile.is_open()) {
        std::cerr << "Failed to open output file: " << outputPath << std::endl;
        return 1;
    }
    outFile << outputJson.dump();
    outFile.close();

    json timingJson;
    timingJson["samples"] = json::array();
    for (auto& s : samples) {
        timingJson["samples"].push_back({{"iteration", s.iteration}, {"kernelTimeNanoseconds", s.kernelTimeNanoseconds}});
    }

    std::ofstream timingFile(timingPath);
    if (!timingFile.is_open()) {
        std::cerr << "Failed to open timing output file: " << timingPath << std::endl;
        return 1;
    }
    timingFile << timingJson.dump();
    timingFile.close();

    return 0;
}
