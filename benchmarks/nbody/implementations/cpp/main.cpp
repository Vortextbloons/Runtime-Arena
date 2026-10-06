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

struct Input {
    int steps;
    double deltaTime;
    int n;
    std::vector<double> mass;
    std::vector<double> ipx, ipy, ipz;
    std::vector<double> ivx, ivy, ivz;
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
    in.n = static_cast<int>(j["bodies"].size());
    in.mass.resize(in.n);
    in.ipx.resize(in.n); in.ipy.resize(in.n); in.ipz.resize(in.n);
    in.ivx.resize(in.n); in.ivy.resize(in.n); in.ivz.resize(in.n);
    int i = 0;
    for (auto& b : j["bodies"]) {
        in.mass[i] = b["mass"].get<double>();
        in.ipx[i] = b["position"][0].get<double>();
        in.ipy[i] = b["position"][1].get<double>();
        in.ipz[i] = b["position"][2].get<double>();
        in.ivx[i] = b["velocity"][0].get<double>();
        in.ivy[i] = b["velocity"][1].get<double>();
        in.ivz[i] = b["velocity"][2].get<double>();
        i++;
    }
    return in;
}

Output kernel(const Input& in, double* __restrict px, double* __restrict py, double* __restrict pz,
              double* __restrict vx, double* __restrict vy, double* __restrict vz) {
    const int n = in.n;
    const double dt = in.deltaTime;
    const double* __restrict mass = in.mass.data();
    std::memcpy(px, in.ipx.data(), sizeof(double) * n);
    std::memcpy(py, in.ipy.data(), sizeof(double) * n);
    std::memcpy(pz, in.ipz.data(), sizeof(double) * n);
    std::memcpy(vx, in.ivx.data(), sizeof(double) * n);
    std::memcpy(vy, in.ivy.data(), sizeof(double) * n);
    std::memcpy(vz, in.ivz.data(), sizeof(double) * n);

    for (int s = 0; s < in.steps; s++) {
        for (int i = 0; i < n; i++) {
            const double pxi = px[i], pyi = py[i], pzi = pz[i];
            const double mi = mass[i];
            double vxi = vx[i], vyi = vy[i], vzi = vz[i];
            for (int j = i + 1; j < n; j++) {
                const double dx = px[j] - pxi;
                const double dy = py[j] - pyi;
                const double dz = pz[j] - pzi;
                const double r2 = dx * dx + dy * dy + dz * dz;
                const double magnitude = dt / (r2 * std::sqrt(r2));
                const double jmf = mass[j] * magnitude;
                const double imf = mi * magnitude;
                vxi += dx * jmf;
                vyi += dy * jmf;
                vzi += dz * jmf;
                vx[j] -= dx * imf;
                vy[j] -= dy * imf;
                vz[j] -= dz * imf;
            }
            vx[i] = vxi;
            vy[i] = vyi;
            vz[i] = vzi;
        }
        for (int i = 0; i < n; i++) {
            px[i] += dt * vx[i];
            py[i] += dt * vy[i];
            pz[i] += dt * vz[i];
        }
    }

    double energy = 0.0;
    for (int i = 0; i < n; i++) {
        const double vxi = vx[i], vyi = vy[i], vzi = vz[i];
        energy += 0.5 * mass[i] * (vxi * vxi + vyi * vyi + vzi * vzi);
        const double pxi = px[i], pyi = py[i], pzi = pz[i];
        const double mi = mass[i];
        for (int j = i + 1; j < n; j++) {
            const double dx = pxi - px[j];
            const double dy = pyi - py[j];
            const double dz = pzi - pz[j];
            energy -= mi * mass[j] / std::sqrt(dx * dx + dy * dy + dz * dz);
        }
    }

    char posData[8192];
    char velData[8192];
    int posLen = 0;
    int velLen = 0;
    for (int i = 0; i < n; i++) {
        posLen += std::snprintf(posData + posLen, sizeof(posData) - posLen, "%.9f,", px[i]);
        posLen += std::snprintf(posData + posLen, sizeof(posData) - posLen, "%.9f,", py[i]);
        posLen += std::snprintf(posData + posLen, sizeof(posData) - posLen, "%.9f,", pz[i]);
        velLen += std::snprintf(velData + velLen, sizeof(velData) - velLen, "%.9f,", vx[i]);
        velLen += std::snprintf(velData + velLen, sizeof(velData) - velLen, "%.9f,", vy[i]);
        velLen += std::snprintf(velData + velLen, sizeof(velData) - velLen, "%.9f,", vz[i]);
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

    std::vector<double> px(in.n), py(in.n), pz(in.n), vx(in.n), vy(in.n), vz(in.n);

    emitLine({{"type", "ready"}, {"protocolVersion", PROTOCOL_VERSION}});

    std::string lastOutput;
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        auto msg = json::parse(line);
        const std::string& type = msg["type"].get<std::string>();
        if (type == "run") {
            int64_t requestId = msg["requestId"].get<int64_t>();
            lastOutput = outputJson(kernel(in, px.data(), py.data(), pz.data(), vx.data(), vy.data(), vz.data())).dump();
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
