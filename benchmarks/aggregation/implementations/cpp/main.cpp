#include <algorithm>
#include <chrono>
#include <climits>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <string>
#include <unordered_map>
#include <vector>
#include <limits>

#include "json.hpp"
#include "sha256.hpp"

using json = nlohmann::json;

struct Row {
    std::string accountId;
    std::string category;
    int64_t quantity;
    int64_t price;
};

struct CategoryAgg {
    int64_t quantity = 0;
    int64_t value = 0;
};

struct AccountAgg {
    std::string accountId;
    int64_t valueMinorUnits = 0;
};

struct Sample {
    int iteration;
    int64_t kernelTimeNanoseconds;
};

static int64_t parseI64(const char* p, const char* end) {
    int64_t val = 0;
    bool neg = false;
    if (p < end && *p == '-') { neg = true; ++p; }
    while (p < end && *p >= '0' && *p <= '9') {
        val = val * 10 + (*p - '0');
        ++p;
    }
    return neg ? -val : val;
}

std::vector<Row> parseCSV(const std::string& content) {
    std::vector<Row> rows;
    const char* p = content.data();
    const char* end = content.data() + content.size();

    while (p < end && *p != '\n' && *p != '\r') ++p;
    while (p < end && (*p == '\n' || *p == '\r')) ++p;

    while (p < end) {
        const char* lineStart = p;
        while (p < end && *p != '\n' && *p != '\r') ++p;
        const char* lineEnd = p;
        while (p < end && (*p == '\n' || *p == '\r')) ++p;

        if (lineStart == lineEnd) continue;

        const char* fieldStarts[5];
        const char* fieldEnds[5];
        int fieldCount = 0;
        const char* f = lineStart;

        for (int i = 0; i < 5 && f <= lineEnd; i++) {
            fieldStarts[i] = f;
            if (i < 4) {
                while (f < lineEnd && *f != ',') ++f;
                fieldEnds[i] = f;
                if (f < lineEnd) ++f;
            } else {
                fieldEnds[i] = lineEnd;
            }
            fieldCount++;
        }

        if (fieldCount < 5) continue;

        Row row;
        row.accountId.assign(fieldStarts[1], fieldEnds[1]);
        row.category.assign(fieldStarts[2], fieldEnds[2]);
        row.quantity = parseI64(fieldStarts[3], fieldEnds[3]);
        row.price = parseI64(fieldStarts[4], fieldEnds[4]);
        rows.push_back(std::move(row));
    }

    return rows;
}

json computeAggregation(const std::vector<Row>& rows) {
    int64_t recordCount = 0;
    int64_t totalQuantity = 0;
    int64_t totalValueMinorUnits = 0;
    int64_t minTransaction = INT64_MAX;
    int64_t maxTransaction = 0;

    std::unordered_map<std::string, CategoryAgg> categories;
    std::unordered_map<std::string, int64_t> accounts;
    categories.reserve(64);
    accounts.reserve(512);

    for (const auto& row : rows) {
        int64_t value = row.quantity * row.price;

        recordCount++;
        totalQuantity += row.quantity;
        totalValueMinorUnits += value;
        if (value < minTransaction) minTransaction = value;
        if (value > maxTransaction) maxTransaction = value;

        auto& cat = categories[row.category];
        cat.quantity += row.quantity;
        cat.value += value;

        accounts[row.accountId] += value;
    }

    std::vector<std::pair<std::string, CategoryAgg>> sortedCats(categories.begin(), categories.end());
    std::sort(sortedCats.begin(), sortedCats.end(),
        [](const auto& a, const auto& b) { return a.first < b.first; });

    json catsArray = json::array();
    for (const auto& [cat, agg] : sortedCats) {
        catsArray.push_back({{"category", cat}, {"quantity", agg.quantity}, {"valueMinorUnits", agg.value}});
    }

    std::vector<AccountAgg> accountVec;
    accountVec.reserve(accounts.size());
    for (const auto& [id, val] : accounts) {
        accountVec.push_back({id, val});
    }
    std::sort(accountVec.begin(), accountVec.end(), [](const AccountAgg& a, const AccountAgg& b) {
        if (a.valueMinorUnits != b.valueMinorUnits) return a.valueMinorUnits > b.valueMinorUnits;
        return a.accountId < b.accountId;
    });

    json topArray = json::array();
    int count = std::min(static_cast<int>(accountVec.size()), 10);
    for (int i = 0; i < count; i++) {
        topArray.push_back({{"accountId", accountVec[i].accountId}, {"valueMinorUnits", accountVec[i].valueMinorUnits}});
    }

    json checksumInput = {{"Categories", catsArray}, {"TopAccounts", topArray}};
    std::string checksumStr = checksumInput.dump() + "\n";
    SHA256 sha;
    sha.update(checksumStr);
    std::string checksum = sha.hex();

    json result;
    result["benchmark"] = "aggregation";
    result["version"] = 1;
    result["recordCount"] = recordCount;
    result["totalQuantity"] = totalQuantity;
    result["totalValueMinorUnits"] = totalValueMinorUnits;
    result["minimumTransactionMinorUnits"] = minTransaction;
    result["maximumTransactionMinorUnits"] = maxTransaction;
    result["categories"] = catsArray;
    result["topAccounts"] = topArray;
    result["checksum"] = checksum;

    return result;
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
        else if (arg == "--warmup" && i + 1 < argc) warmup = std::atoi(argv[++i]);
        else if (arg == "--min-iterations" && i + 1 < argc) minIterations = std::atoi(argv[++i]);
        else if (arg == "--max-iterations" && i + 1 < argc) maxIterations = std::atoi(argv[++i]);
        else if (arg == "--target-relative-ci" && i + 1 < argc) targetCi = std::stod(argv[++i]);
    }

    if (inputPath.empty() || outputPath.empty() || timingPath.empty()) {
        std::cerr << "Usage: aggregation --input <file> --output <file> --timing-output <file> [--warmup <n>] [--iterations <n>]" << std::endl;
        return 1;
    }

    std::string csvContent;
    {
        std::ifstream f(inputPath);
        if (!f.is_open()) {
            std::cerr << "Failed to open input file: " << inputPath << std::endl;
            std::exit(1);
        }
        std::ostringstream ss;
        ss << f.rdbuf();
        csvContent = ss.str();
    }

    std::vector<Row> rows = parseCSV(csvContent);

    std::vector<Sample> samples;
    json outputJson;

    std::vector<long long> kernelTimes;
    for (int i = -warmup; ; i++) {
        auto start = std::chrono::high_resolution_clock::now();
        outputJson = computeAggregation(rows);
        auto end = std::chrono::high_resolution_clock::now();

        int64_t elapsed = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count();
        if (elapsed < 1) elapsed = 1;

        if (i >= 0) {
            kernelTimes.push_back(elapsed);
            samples.push_back({static_cast<int>(samples.size()) + 1, elapsed});
            if (static_cast<int>(kernelTimes.size()) >= maxIterations || (static_cast<int>(kernelTimes.size()) >= minIterations && ciWidth(kernelTimes) <= targetCi)) break;
        }
    }

    {
        std::ofstream outFile(outputPath);
        if (!outFile.is_open()) {
            std::cerr << "Failed to open output file: " << outputPath << std::endl;
            return 1;
        }
        outFile << outputJson.dump();
    }

    json timingJson;
    timingJson["samples"] = json::array();
    for (auto& s : samples) {
        timingJson["samples"].push_back({{"iteration", s.iteration}, {"kernelTimeNanoseconds", s.kernelTimeNanoseconds}});
    }

    {
        std::ofstream timingFile(timingPath);
        if (!timingFile.is_open()) {
            std::cerr << "Failed to open timing output file: " << timingPath << std::endl;
            return 1;
        }
        timingFile << timingJson.dump();
    }

    return 0;
}
