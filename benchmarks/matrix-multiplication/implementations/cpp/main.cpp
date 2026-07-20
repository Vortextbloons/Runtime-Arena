#include <chrono>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <limits>

#include "json.hpp"
#include "sha256.hpp"

using json = nlohmann::json;

struct Input {
    int dimension;
    std::vector<int64_t> left;
    std::vector<int64_t> right;
};

struct Output {
    std::string benchmark;
    int version;
    int dimension;
    int elementCount;
    int64_t valueSum;
    int64_t diagonalSum;
    std::string checksum;
};

struct Sample {
    int iteration;
    int64_t kernelTimeNanoseconds;
};

Input parseInput(const json& j) {
    Input in;
    in.dimension = j["dimension"].get<int>();
    for (auto& v : j["left"]) in.left.push_back(v.get<int64_t>());
    for (auto& v : j["right"]) in.right.push_back(v.get<int64_t>());
    return in;
}

Output kernel(const Input& in, std::vector<int64_t>& c) {
    const int n = in.dimension;
    const int64_t* a = in.left.data();
    const int64_t* b = in.right.data();
    int64_t valueSum = 0;
    int64_t diagonalSum = 0;

    std::memset(c.data(), 0, n * n * sizeof(int64_t));

    for (int i = 0; i < n; i++) {
        for (int k = 0; k < n; k++) {
            int64_t aik = a[i * n + k];
            for (int j = 0; j < n; j++) {
                c[i * n + j] += aik * b[k * n + j];
            }
        }
    }

    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            valueSum += c[i * n + j];
            if (i == j) diagonalSum += c[i * n + j];
        }
    }

    size_t bufCap = static_cast<size_t>(n) * n * 21 + 256;
    char* buf = static_cast<char*>(std::malloc(bufCap));
    int bufLen = std::snprintf(buf, bufCap, "dimension=%d\n", n);
    for (int i = 0; i < n * n; i++) {
        bufLen += std::snprintf(buf + bufLen, bufCap - bufLen, "%lld,", static_cast<long long>(c[i]));
    }
    bufLen += std::snprintf(buf + bufLen, bufCap - bufLen, "\n");

    SHA256 hasher;
    hasher.update(reinterpret_cast<const uint8_t*>(buf), bufLen);
    std::free(buf);

    Output out;
    out.benchmark = "matrix-multiplication";
    out.version = 1;
    out.dimension = n;
    out.elementCount = n * n;
    out.valueSum = valueSum;
    out.diagonalSum = diagonalSum;
    out.checksum = hasher.hex();
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
        std::cerr << "Usage: matrix-multiplication --input <file> --output <file> --timing-output <file> [--warmup <n>] [--iterations <n>]" << std::endl;
        return 1;
    }

    json inputJson = json::parse(readFile(inputPath));
    Input in = parseInput(inputJson);

    std::vector<Sample> samples;
    Output out;
    std::vector<int64_t> c(in.dimension * in.dimension);

    std::vector<long long> kernelTimes;
    for (int i = -warmup; ; i++) {
        auto start = std::chrono::high_resolution_clock::now();
        out = kernel(in, c);
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
    outputJson["dimension"] = out.dimension;
    outputJson["elementCount"] = out.elementCount;
    outputJson["valueSum"] = out.valueSum;
    outputJson["diagonalSum"] = out.diagonalSum;
    outputJson["checksum"] = out.checksum;

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
