#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

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

static void hashRecord(SHA256& hasher, const Record& r) {
    char buf[64];
    int len = snprintf(buf, sizeof(buf), "%lld,%lld,%lld\n",
        static_cast<long long>(r.id),
        static_cast<long long>(r.score),
        static_cast<long long>(r.timestamp));
    hasher.update(reinterpret_cast<const uint8_t*>(buf), static_cast<size_t>(len));
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
        std::cerr << "Usage: record-sorting --input <file> --output <file> --timing-output <file> [--warmup <n>] [--iterations <n>]" << std::endl;
        return 1;
    }

    json inputJson = json::parse(readFile(inputPath));
    std::vector<Record> inputRecords;
    for (auto& r : inputJson["records"]) {
        inputRecords.push_back({r["id"].get<int64_t>(), r["score"].get<int64_t>(), r["timestamp"].get<int64_t>()});
    }

    std::vector<Sample> samples;
    json outputJson;

    for (int i = -warmup; i < iterations; i++) {
        std::vector<Record> recs = inputRecords;

        auto start = std::chrono::high_resolution_clock::now();

        std::sort(recs.begin(), recs.end(), [](const Record& a, const Record& b) {
            if (a.score != b.score) return a.score > b.score;
            if (a.timestamp != b.timestamp) return a.timestamp < b.timestamp;
            return a.id < b.id;
        });

        int n = static_cast<int>(recs.size());
        int take = std::min(n, 10);

        json firstArr = json::array();
        for (int j = 0; j < take; j++) {
            firstArr.push_back({{"id", recs[j].id}, {"score", recs[j].score}, {"timestamp", recs[j].timestamp}});
        }

        json lastArr = json::array();
        for (int j = n - take; j < n; j++) {
            lastArr.push_back({{"id", recs[j].id}, {"score", recs[j].score}, {"timestamp", recs[j].timestamp}});
        }

        SHA256 hasher;
        for (auto& r : recs) {
            hashRecord(hasher, r);
        }

        auto end = std::chrono::high_resolution_clock::now();
        int64_t elapsed = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count();
        if (elapsed < 1) elapsed = 1;

        if (i >= 0) {
            samples.push_back({i + 1, elapsed});
            outputJson["benchmark"] = "record-sorting";
            outputJson["version"] = 1;
            outputJson["recordCount"] = n;
            outputJson["firstRecords"] = firstArr;
            outputJson["lastRecords"] = lastArr;
            outputJson["checksum"] = hasher.hex();
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
