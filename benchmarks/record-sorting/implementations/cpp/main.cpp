#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include <limits>

#include "json.hpp"
#include "sha256.hpp"

using json = nlohmann::json;

struct Record {
    int64_t id;
    int64_t score;
    int64_t timestamp;
};

struct Sample {
    int iteration;
    int64_t kernelTimeNanoseconds;
};

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
        std::cerr << "Usage: record-sorting --input <file> --output <file> --timing-output <file> [--warmup <n>] [--iterations <n>]" << std::endl;
        return 1;
    }

    json inputJson = json::parse(readFile(inputPath));
    std::vector<Record> inputRecords;
    for (auto& r : inputJson["records"]) {
        inputRecords.push_back({r["id"].get<int64_t>(), r["score"].get<int64_t>(), r["timestamp"].get<int64_t>()});
    }

    const int n = static_cast<int>(inputRecords.size());
    const int take = std::min(n, 10);

    std::vector<Sample> samples;
    json outputJson;

    std::vector<Record> recs;
    recs.reserve(n);

    std::vector<long long> kernelTimes;
    for (int i = -warmup; ; i++) {
        recs = inputRecords;

        auto start = std::chrono::high_resolution_clock::now();

        std::sort(recs.begin(), recs.end(), [](const Record& a, const Record& b) {
            if (a.score != b.score) return a.score > b.score;
            if (a.timestamp != b.timestamp) return a.timestamp < b.timestamp;
            return a.id < b.id;
        });

        SHA256 hasher;
        char rbuf[64];
        for (int j = 0; j < n; j++) {
            int len = std::snprintf(rbuf, sizeof(rbuf), "%lld,%lld,%lld\n",
                static_cast<long long>(recs[j].id),
                static_cast<long long>(recs[j].score),
                static_cast<long long>(recs[j].timestamp));
            hasher.update(reinterpret_cast<const uint8_t*>(rbuf), len);
        }

        auto end = std::chrono::high_resolution_clock::now();
        int64_t elapsed = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count();
        if (elapsed < 1) elapsed = 1;

        if (i >= 0) {
            kernelTimes.push_back(elapsed);
            samples.push_back({static_cast<int>(samples.size()) + 1, elapsed});
            outputJson["benchmark"] = "record-sorting";
            outputJson["version"] = 1;
            outputJson["recordCount"] = n;

            json firstArr = json::array();
            for (int j = 0; j < take; j++) {
                firstArr.push_back({{"id", recs[j].id}, {"score", recs[j].score}, {"timestamp", recs[j].timestamp}});
            }
            json lastArr = json::array();
            for (int j = n - take; j < n; j++) {
                lastArr.push_back({{"id", recs[j].id}, {"score", recs[j].score}, {"timestamp", recs[j].timestamp}});
            }
            outputJson["firstRecords"] = std::move(firstArr);
            outputJson["lastRecords"] = std::move(lastArr);
            outputJson["checksum"] = hasher.hex();
            if (static_cast<int>(kernelTimes.size()) >= maxIterations
                || (static_cast<int>(kernelTimes.size()) >= minIterations && ciWidth(kernelTimes) <= targetCi))
                break;
        }
    }

    std::ofstream outFile(outputPath);
    outFile << outputJson.dump();
    outFile.close();

    json timingJson;
    timingJson["samples"] = json::array();
    for (auto& s : samples) {
        timingJson["samples"].push_back({{"iteration", s.iteration}, {"kernelTimeNanoseconds", s.kernelTimeNanoseconds}});
    }

    std::ofstream timingFile(timingPath);
    timingFile << timingJson.dump();
    timingFile.close();

    return 0;
}
