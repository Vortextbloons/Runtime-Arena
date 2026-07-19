#include <algorithm>
#include <chrono>
#include <climits>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "json.hpp"
#include "sha256.hpp"

using json = nlohmann::json;

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

std::vector<std::string> splitLine(const std::string& line) {
    std::vector<std::string> fields;
    std::istringstream ss(line);
    std::string field;
    while (std::getline(ss, field, ',')) {
        fields.push_back(field);
    }
    return fields;
}

json computeAggregation(const std::string& csvContent) {
    std::istringstream stream(csvContent);
    std::string line;

    std::getline(stream, line);

    int64_t recordCount = 0;
    int64_t totalQuantity = 0;
    int64_t totalValueMinorUnits = 0;
    int64_t minTransaction = INT64_MAX;
    int64_t maxTransaction = 0;
    std::map<std::string, CategoryAgg> categories;
    std::map<std::string, int64_t> accounts;

    while (std::getline(stream, line)) {
        if (line.empty()) continue;

        auto fields = splitLine(line);
        if (fields.size() < 5) continue;

        const std::string& accountId = fields[1];
        const std::string& category = fields[2];
        int64_t qty = std::stoll(fields[3]);
        int64_t price = std::stoll(fields[4]);
        int64_t value = qty * price;

        recordCount++;
        totalQuantity += qty;
        totalValueMinorUnits += value;
        if (value < minTransaction) minTransaction = value;
        if (value > maxTransaction) maxTransaction = value;

        categories[category].quantity += qty;
        categories[category].value += value;
        accounts[accountId] += value;
    }

    json catsArray = json::array();
    for (auto& [cat, agg] : categories) {
        catsArray.push_back({{"category", cat}, {"quantity", agg.quantity}, {"valueMinorUnits", agg.value}});
    }

    std::vector<AccountAgg> accountVec;
    for (auto& [id, val] : accounts) {
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
        std::cerr << "Usage: aggregation --input <file> --output <file> --timing-output <file> [--warmup <n>] [--iterations <n>]" << std::endl;
        return 1;
    }

    std::string csvContent = readFile(inputPath);

    std::vector<Sample> samples;
    json outputJson;

    for (int i = -warmup; i < iterations; i++) {
        auto start = std::chrono::high_resolution_clock::now();
        outputJson = computeAggregation(csvContent);
        auto end = std::chrono::high_resolution_clock::now();

        int64_t elapsed = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count();
        if (elapsed < 1) elapsed = 1;

        if (i >= 0) {
            samples.push_back({i + 1, elapsed});
        }
    }

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
