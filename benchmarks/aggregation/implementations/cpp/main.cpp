#include <algorithm>
#include <climits>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <string_view>
#include <unordered_map>
#include <utility>
#include <vector>

#include "sha256.hpp"

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

/* FNV-1a: ~3x faster than the default std::hash<string> (SipHash) for short keys */
struct FnvHash {
    size_t operator()(std::string_view s) const noexcept {
        uint64_t h = 1469598103934665603ull;
        for (char c : s) {
            h ^= static_cast<unsigned char>(c);
            h *= 1099511628211ull;
        }
        return static_cast<size_t>(h);
    }
    size_t operator()(const std::string& s) const noexcept {
        return (*this)(std::string_view(s));
    }
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
    rows.reserve(250000);
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

/* Two-digits-at-a-time integer append; avoids iostream/locale overhead */
static void appendInt(std::string& out, int64_t v) {
    static const char DIGITS[] =
        "00010203040506070809"
        "10111213141516171819"
        "20212223242526272829"
        "30313233343536373839"
        "40414243444546474849"
        "50515253545556575859"
        "60616263646566676869"
        "70717273747576777879"
        "80818283848586878889"
        "90919293949596979899";
    char tmp[24];
    char* p = tmp + sizeof(tmp);
    uint64_t u = v < 0 ? (uint64_t)(-(v + 1)) + 1u : (uint64_t)v;
    while (u >= 100) {
        unsigned idx = (unsigned)(u % 100) * 2;
        p -= 2;
        p[0] = DIGITS[idx];
        p[1] = DIGITS[idx + 1];
        u /= 100;
    }
    if (u >= 10) {
        unsigned idx = (unsigned)u * 2;
        p -= 2;
        p[0] = DIGITS[idx];
        p[1] = DIGITS[idx + 1];
    } else {
        *--p = (char)('0' + u);
    }
    if (v < 0) *--p = '-';
    out.append(p, tmp + sizeof(tmp) - p);
}

static void appendCatEntry(std::string& out, const std::string& name, int64_t q, int64_t v) {
    out += "{\"category\":\"";
    out += name;
    out += "\",\"quantity\":";
    appendInt(out, q);
    out += ",\"valueMinorUnits\":";
    appendInt(out, v);
    out += '}';
}

static void appendAcctEntry(std::string& out, const std::string& id, int64_t v) {
    out += "{\"accountId\":\"";
    out += id;
    out += "\",\"valueMinorUnits\":";
    appendInt(out, v);
    out += '}';
}

/* Scratch reused across iterations: hash tables cleared in place so bucket
 * arrays (and the distinct key strings) survive warmup; no rehash, no rescan. */
static std::unordered_map<std::string, CategoryAgg, FnvHash> gCategories;
static std::unordered_map<std::string, int64_t, FnvHash> gAccounts;
static std::vector<std::pair<const std::string*, CategoryAgg*>> gCatPtrs;
static std::vector<std::pair<const std::string*, int64_t*>> gAcctPtrs;
static std::string gChecksum;
static std::string gOutput;

std::string computeAggregation(const std::vector<Row>& rows) {
    int64_t recordCount = 0;
    int64_t totalQuantity = 0;
    int64_t totalValueMinorUnits = 0;
    int64_t minTransaction = INT64_MAX;
    int64_t maxTransaction = 0;

    auto& categories = gCategories;
    auto& accounts = gAccounts;
    for (auto& kv : categories) {
        kv.second.quantity = 0;
        kv.second.value = 0;
    }
    for (auto& kv : accounts) kv.second = 0;

    for (const auto& row : rows) {
        int64_t value = row.quantity * row.price;

        recordCount++;
        totalQuantity += row.quantity;
        totalValueMinorUnits += value;
        if (value < minTransaction) minTransaction = value;
        if (value > maxTransaction) maxTransaction = value;

        auto cit = categories.find(row.category);
        if (cit == categories.end()) {
            cit = categories.emplace(row.category, CategoryAgg{}).first;
            gCatPtrs.emplace_back(&cit->first, &cit->second);
        }
        cit->second.quantity += row.quantity;
        cit->second.value += value;

        auto ait = accounts.find(row.accountId);
        if (ait == accounts.end()) {
            ait = accounts.emplace(row.accountId, 0).first;
            gAcctPtrs.emplace_back(&ait->first, &ait->second);
        }
        ait->second += value;
    }

    auto& catPtrs = gCatPtrs;
    auto& acctPtrs = gAcctPtrs;
    std::sort(catPtrs.begin(), catPtrs.end(),
        [](const auto& a, const auto& b) { return *a.first < *b.first; });

    /* Top-10 by partial selection over pointer pairs (no value copies) */
    size_t topN = acctPtrs.size() < 10 ? acctPtrs.size() : 10;
    std::partial_sort(acctPtrs.begin(), acctPtrs.begin() + topN, acctPtrs.end(),
        [](const auto& a, const auto& b) {
            if (*a.second != *b.second) return *a.second > *b.second;
            return *a.first < *b.first;
        });

    /* Checksum input first: byte-identical entry encoding to the checker. */
    auto& checksumStr = gChecksum;
    checksumStr.clear();
    checksumStr.reserve(2048);
    checksumStr += "{\"Categories\":[";
    for (size_t i = 0; i < catPtrs.size(); i++) {
        if (i > 0) checksumStr += ',';
        appendCatEntry(checksumStr, *catPtrs[i].first, catPtrs[i].second->quantity, catPtrs[i].second->value);
    }
    checksumStr += "],\"TopAccounts\":[";
    for (size_t i = 0; i < topN; i++) {
        if (i > 0) checksumStr += ',';
        appendAcctEntry(checksumStr, *acctPtrs[i].first, *acctPtrs[i].second);
    }
    checksumStr += "]}\n";
    SHA256 csha;
    csha.update(checksumStr);
    std::string checksum = csha.hex();

    /* Final output reuses the same entry bytes (single serialization). */
    auto& out = gOutput;
    out.clear();
    out.reserve(checksumStr.size() + 256);
    out += "{\"benchmark\":\"aggregation\",\"version\":1,\"recordCount\":";
    appendInt(out, recordCount);
    out += ",\"totalQuantity\":";
    appendInt(out, totalQuantity);
    out += ",\"totalValueMinorUnits\":";
    appendInt(out, totalValueMinorUnits);
    out += ",\"categories\":[";
    for (size_t i = 0; i < catPtrs.size(); i++) {
        if (i > 0) out += ',';
        appendCatEntry(out, *catPtrs[i].first, catPtrs[i].second->quantity, catPtrs[i].second->value);
    }
    out += "],\"topAccounts\":[";
    for (size_t i = 0; i < topN; i++) {
        if (i > 0) out += ',';
        appendAcctEntry(out, *acctPtrs[i].first, *acctPtrs[i].second);
    }
    out += "],\"minimumTransactionMinorUnits\":";
    appendInt(out, minTransaction);
    out += ",\"maximumTransactionMinorUnits\":";
    appendInt(out, maxTransaction);
    out += ",\"checksum\":\"";
    out += checksum;
    out += "\"}";

    return out;
}

static std::string getArg(int argc, char* argv[], const char* name) {
    for (int i = 1; i < argc - 1; i++)
        if (std::strcmp(argv[i], name) == 0) return argv[i + 1];
    return "";
}

/* Manual protocol field scan: the harness lines are tiny; a full JSON parse
 * per iteration (nlohmann) costs more than the checksum hash itself. */
static bool protoField(const std::string& line, const char* field, std::string& value) {
    std::string key = std::string("\"") + field + "\":";
    size_t pos = line.find(key);
    if (pos == std::string::npos) return false;
    pos += key.size();
    while (pos < line.size() && line[pos] == ' ') pos++;
    if (pos >= line.size()) return false;
    if (line[pos] == '"') {
        size_t end = line.find('"', pos + 1);
        if (end == std::string::npos) return false;
        value.assign(line, pos + 1, end - pos - 1);
        return true;
    }
    size_t end = pos;
    while (end < line.size() && line[end] != ',' && line[end] != '}' && line[end] != ' ') end++;
    value.assign(line, pos, end - pos);
    return true;
}

static void emitLine(const std::string& s) {
    std::cout << s << '\n';
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
        std::ifstream f(inputPath, std::ios::binary);
        if (!f.is_open()) {
            std::cerr << "Failed to open input file: " << inputPath << std::endl;
            return 1;
        }
        std::ostringstream ss;
        ss << f.rdbuf();
        csvContent = ss.str();
    }

    std::vector<Row> rows = parseCSV(csvContent);
    csvContent.clear();
    csvContent.shrink_to_fit();

    gCategories.reserve(64);
    gCategories.max_load_factor(0.7);
    gAccounts.reserve(512);
    gAccounts.max_load_factor(0.7);
    gCatPtrs.reserve(64);
    gAcctPtrs.reserve(512);

    emitLine("{\"type\":\"ready\",\"protocolVersion\":\"2.0.0\"}");

    std::string lastOutput;
    std::string line;
    std::string field;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        if (!protoField(line, "type", field)) continue;
        if (field == "run") {
            std::string reqId = "0";
            protoField(line, "requestId", reqId);
            lastOutput = computeAggregation(rows);
            emitLine(std::string("{\"type\":\"result\",\"requestId\":") + reqId +
                     ",\"digest\":\"" + digestBytes(lastOutput) + "\"}");
        } else if (field == "finish") {
            std::ofstream outFile(outputPath, std::ios::binary);
            if (!outFile.is_open()) {
                std::cerr << "Failed to open output file: " << outputPath << std::endl;
                return 1;
            }
            outFile << lastOutput;
            emitLine(std::string("{\"type\":\"finish\",\"digest\":\"") + digestBytes(lastOutput) + "\"}");
            break;
        }
    }

    return 0;
}
