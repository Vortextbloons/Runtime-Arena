#include <algorithm>
#include <climits>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

#include "json.hpp"
#include "sha256.hpp"

using json = nlohmann::json;

static const char* PROTOCOL_VERSION = "2.0.0";

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
    std::string checksumStr = checksumInput.dump();
    checksumStr.push_back('\n');
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
    result["categories"] = std::move(catsArray);
    result["topAccounts"] = std::move(topArray);
    result["checksum"] = std::move(checksum);

    return result;
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

int main(int argc, char* argv[]) {
    if (getArg(argc, argv, "--protocol-version") != PROTOCOL_VERSION) {
        std::cerr << "unsupported protocol version" << std::endl;
        return 1;
    }

    std::string inputPath = getArg(argc, argv, "--input");
    std::string outputPath = getArg(argc, argv, "--output");
    if (inputPath.empty() || outputPath.empty()) {
        std::cerr << "Usage: aggregation --input <file> --output <file> --protocol-version 2.0.0" << std::endl;
        return 1;
    }

    std::string csvContent;
    {
        std::ifstream f(inputPath);
        if (!f.is_open()) {
            std::cerr << "Failed to open input file: " << inputPath << std::endl;
            return 1;
        }
        std::ostringstream ss;
        ss << f.rdbuf();
        csvContent = ss.str();
    }

    std::vector<Row> rows = parseCSV(csvContent);

    emitLine({{"type", "ready"}, {"protocolVersion", PROTOCOL_VERSION}});

    std::string lastOutput;
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        auto msg = json::parse(line);
        const std::string& type = msg["type"].get<std::string>();
        if (type == "run") {
            int64_t requestId = msg["requestId"].get<int64_t>();
            lastOutput = computeAggregation(rows).dump();
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
