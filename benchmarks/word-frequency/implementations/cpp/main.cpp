#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>
#include <limits>

#include "json.hpp"
#include "sha256.hpp"

using json = nlohmann::json;

struct Entry {
    std::string word;
    int count;
};

struct Output {
    std::string benchmark;
    int version;
    int totalWords;
    int uniqueWords;
    std::vector<Entry> topWords;
    std::string checksum;
};

struct Sample {
    int iteration;
    int64_t kernelTimeNanoseconds;
};

Output kernel(const std::vector<std::string>& words) {
    std::unordered_map<std::string, int> freq;
    for (const auto& w : words) {
        freq[w]++;
    }

    std::vector<Entry> entries;
    entries.reserve(freq.size());
    for (const auto& [w, c] : freq) {
        entries.push_back({w, c});
    }

    std::sort(entries.begin(), entries.end(), [](const Entry& a, const Entry& b) {
        if (a.count != b.count) return a.count > b.count;
        return a.word < b.word;
    });

    SHA256 hasher;
    for (const auto& e : entries) {
        hasher.update(e.word + "," + std::to_string(e.count) + "\n");
    }

    std::vector<Entry> top;
    for (int i = 0; i < std::min(10, (int)entries.size()); i++) {
        top.push_back(entries[i]);
    }

    Output out;
    out.benchmark = "word-frequency";
    out.version = 1;
    out.totalWords = words.size();
    out.uniqueWords = entries.size();
    out.topWords = top;
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
        std::cerr << "Usage: word-frequency --input <file> --output <file> --timing-output <file> [--warmup <n>] [--iterations <n>]" << std::endl;
        return 1;
    }

    json inputJson = json::parse(readFile(inputPath));
    std::vector<std::string> words;
    for (const auto& w : inputJson["words"]) {
        words.push_back(w.get<std::string>());
    }

    std::vector<Sample> samples;
    Output out;

    std::vector<long long> kernelTimes;
    for (int i = -warmup; ; i++) {
        auto start = std::chrono::high_resolution_clock::now();
        out = kernel(words);
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
    outputJson["totalWords"] = out.totalWords;
    outputJson["uniqueWords"] = out.uniqueWords;
    outputJson["topWords"] = json::array();
    for (const auto& e : out.topWords) {
        outputJson["topWords"].push_back({{"word", e.word}, {"count", e.count}});
    }
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
    for (const auto& s : samples) {
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
