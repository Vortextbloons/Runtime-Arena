#include <algorithm>
#include <array>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "json.hpp"
#include "sha256.hpp"

using json = nlohmann::json;

static const char* PROTOCOL_VERSION = "2.0.0";

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

static std::string getArg(int argc, char* argv[], const char* name) {
    for (int i = 1; i < argc - 1; i++)
        if (std::strcmp(argv[i], name) == 0) return argv[i + 1];
    return "";
}

static void emitLine(const json& value) {
    std::cout << value.dump() << std::endl;
    std::cout.flush();
}

static std::string digestBytes(const std::string& bytes) {
    SHA256 sha;
    sha.update(bytes);
    return sha.hex();
}

static json outputJson(const Output& out) {
    return {
        {"benchmark", out.benchmark},
        {"version", out.version},
        {"bodyCount", out.bodyCount},
        {"finalEnergy", out.finalEnergy},
        {"positionChecksum", out.positionChecksum},
        {"velocityChecksum", out.velocityChecksum}
    };
}

int main(int argc, char* argv[]) {
    if (getArg(argc, argv, "--protocol-version") != PROTOCOL_VERSION) {
        std::cerr << "unsupported protocol version" << std::endl;
        return 1;
    }

    std::string inputPath = getArg(argc, argv, "--input");
    std::string outputPath = getArg(argc, argv, "--output");
    if (inputPath.empty() || outputPath.empty()) {
        std::cerr << "Usage: nbody --input <file> --output <file> --protocol-version 2.0.0" << std::endl;
        return 1;
    }

    json inputJson = json::parse(readFile(inputPath));
    Input in = parseInput(inputJson);

    emitLine({{"type", "ready"}, {"protocolVersion", PROTOCOL_VERSION}});

    std::string lastOutput;
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        auto msg = json::parse(line);
        const std::string& type = msg["type"].get<std::string>();
        if (type == "run") {
            int64_t requestId = msg["requestId"].get<int64_t>();
            std::vector<Body> bodiesCopy = in.bodies;
            lastOutput = outputJson(kernel(in, bodiesCopy)).dump();
            emitLine({{"type", "result"}, {"requestId", requestId}, {"digest", digestBytes(lastOutput)}});
        } else if (type == "finish") {
            std::ofstream outFile(outputPath);
            if (!outFile.is_open()) {
                std::cerr << "Failed to open output file: " << outputPath << std::endl;
                return 1;
            }
            outFile << lastOutput;
            emitLine({{"type", "finish"}, {"digest", digestBytes(lastOutput)}});
            break;
        }
    }

    return 0;
}
