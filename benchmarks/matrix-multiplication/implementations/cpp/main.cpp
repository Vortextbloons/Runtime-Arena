#include <chrono>
#include <cstdlib>
#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

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

Output kernel(const Input& in) {
    int n = in.dimension;
    std::vector<int64_t> c(n * n);
    int64_t valueSum = 0;
    int64_t diagonalSum = 0;
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            int64_t sum = 0;
            for (int k = 0; k < n; k++) {
                sum += in.left[i * n + k] * in.right[k * n + j];
            }
            c[i * n + j] = sum;
            valueSum += sum;
            if (i == j) diagonalSum += sum;
        }
    }
    std::string data = "dimension=" + std::to_string(n) + "\n";
    for (int i = 0; i < n * n; i++) {
        data += std::to_string(c[i]) + ",";
    }
    data += "\n";
    SHA256 hasher;
    hasher.update(data);
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
        std::cerr << "Usage: matrix-multiplication --input <file> --output <file> --timing-output <file> [--warmup <n>] [--iterations <n>]" << std::endl;
        return 1;
    }

    json inputJson = json::parse(readFile(inputPath));
    Input in = parseInput(inputJson);

    std::vector<Sample> samples;
    Output out;

    for (int i = -warmup; i < iterations; i++) {
        auto start = std::chrono::high_resolution_clock::now();
        out = kernel(in);
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
