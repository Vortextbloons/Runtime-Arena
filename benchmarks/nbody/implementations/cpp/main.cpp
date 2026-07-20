#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <limits>

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

Output kernel(const Input& in, std::vector<Body>& bodies) {
    const int n = static_cast<int>(bodies.size());
    const double dt = in.deltaTime;

    for (int s = 0; s < in.steps; s++) {
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                double dx = bodies[j].position[0] - bodies[i].position[0];
                double dy = bodies[j].position[1] - bodies[i].position[1];
                double dz = bodies[j].position[2] - bodies[i].position[2];
                double r2 = dx * dx + dy * dy + dz * dz;
                double magnitude = dt / (r2 * std::sqrt(r2));
                double jmi = bodies[j].mass * magnitude;
                double imj = bodies[i].mass * magnitude;
                bodies[i].velocity[0] += dx * jmi;
                bodies[i].velocity[1] += dy * jmi;
                bodies[i].velocity[2] += dz * jmi;
                bodies[j].velocity[0] -= dx * imj;
                bodies[j].velocity[1] -= dy * imj;
                bodies[j].velocity[2] -= dz * imj;
            }
        }
        for (int i = 0; i < n; i++) {
            bodies[i].position[0] += dt * bodies[i].velocity[0];
            bodies[i].position[1] += dt * bodies[i].velocity[1];
            bodies[i].position[2] += dt * bodies[i].velocity[2];
        }
    }

    double energy = 0.0;
    for (int i = 0; i < n; i++) {
        double v2 = bodies[i].velocity[0] * bodies[i].velocity[0]
                  + bodies[i].velocity[1] * bodies[i].velocity[1]
                  + bodies[i].velocity[2] * bodies[i].velocity[2];
        energy += 0.5 * bodies[i].mass * v2;
        for (int j = i + 1; j < n; j++) {
            double dx = bodies[i].position[0] - bodies[j].position[0];
            double dy = bodies[i].position[1] - bodies[j].position[1];
            double dz = bodies[i].position[2] - bodies[j].position[2];
            double r2 = dx * dx + dy * dy + dz * dz;
            energy -= bodies[i].mass * bodies[j].mass / std::sqrt(r2);
        }
    }

    char posData[8192];
    char velData[8192];
    int posLen = 0;
    int velLen = 0;
    for (int i = 0; i < n; i++) {
        for (int k = 0; k < 3; k++) {
            posLen += std::snprintf(posData + posLen, sizeof(posData) - posLen, "%.9f,", bodies[i].position[k]);
            velLen += std::snprintf(velData + velLen, sizeof(velData) - velLen, "%.9f,", bodies[i].velocity[k]);
        }
    }

    SHA256 ph, vh;
    ph.update(reinterpret_cast<const uint8_t*>(posData), posLen);
    vh.update(reinterpret_cast<const uint8_t*>(velData), velLen);

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

static const double T_CRITICAL[30] = {0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045};
double ciWidth(const std::vector<long long>& samples) {
    const size_t n = samples.size();
    if (n < 2) return std::numeric_limits<double>::infinity();
    double mean = 0;
    for (long long value : samples) mean += static_cast<double>(value);
    mean /= static_cast<double>(n);
    if (mean <= 0) return std::numeric_limits<double>::infinity();
    double variance = 0;
    for (long long value : samples) { const double delta = static_cast<double>(value) - mean; variance += delta * delta; }
    variance /= static_cast<double>(n - 1);
    const double t = n < 30 ? T_CRITICAL[n] : 2.0;
    return (2.0 * t * std::sqrt(variance / static_cast<double>(n))) / mean;
}

int main(int argc, char* argv[]) {
    std::string inputPath, outputPath, timingPath;
    int warmup = 0, minIterations = 1, maxIterations = 1;
    double targetCi = 0.05;

    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--input" && i + 1 < argc) inputPath = argv[++i];
        else if (arg == "--output" && i + 1 < argc) outputPath = argv[++i];
        else if (arg == "--timing-output" && i + 1 < argc) timingPath = argv[++i];
        else if (arg == "--warmup" && i + 1 < argc) warmup = std::stoi(argv[++i]);
        else if (arg == "--min-iterations" && i + 1 < argc) minIterations = std::stoi(argv[++i]);
        else if (arg == "--max-iterations" && i + 1 < argc) maxIterations = std::stoi(argv[++i]);
        else if (arg == "--target-relative-ci" && i + 1 < argc) targetCi = std::stod(argv[++i]);
    }

    if (inputPath.empty() || outputPath.empty() || timingPath.empty()) {
        std::cerr << "Usage: nbody --input <file> --output <file> --timing-output <file> [--warmup <n>] [--iterations <n>]" << std::endl;
        return 1;
    }

    json inputJson = json::parse(readFile(inputPath));
    Input in = parseInput(inputJson);

    std::vector<Sample> samples;
    Output out;

    std::vector<long long> kernelTimes;
    for (int i = -warmup; ; i++) {
        std::vector<Body> bodiesCopy = in.bodies;

        auto start = std::chrono::high_resolution_clock::now();
        out = kernel(in, bodiesCopy);
        auto end = std::chrono::high_resolution_clock::now();

        int64_t elapsed = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count();
        if (elapsed < 1) elapsed = 1;

        if (i >= 0) {
            kernelTimes.push_back(elapsed);
            samples.push_back({static_cast<int>(samples.size()) + 1, elapsed});
            if (static_cast<int>(kernelTimes.size()) >= maxIterations || (static_cast<int>(kernelTimes.size()) >= minIterations && ciWidth(kernelTimes) <= targetCi)) break;
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
