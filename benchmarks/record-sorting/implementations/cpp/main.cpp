#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "json.hpp"
#include "sha256.hpp"

using json = nlohmann::json;

static const char* PROTOCOL_VERSION = "2.0.0";
static constexpr uint32_t RADIX_SIZE = 65536;

struct Record {
    int64_t id;
    int64_t score;
    int64_t timestamp;
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

static inline uint64_t rkey(const Record& r, int sel) {
    if (sel == 0) return static_cast<uint64_t>(r.id) ^ 0x8000000000000000ULL;
    if (sel == 1) return static_cast<uint64_t>(r.timestamp) ^ 0x8000000000000000ULL;
    /* score descending */
    return static_cast<uint64_t>(r.score) ^ 0x7FFFFFFFFFFFFFFFULL;
}

static void radix_pass(const Record* src, Record* dst, size_t n, int sel, int shift, uint32_t* cnt) {
    std::memset(cnt, 0, RADIX_SIZE * sizeof(uint32_t));
    for (size_t i = 0; i < n; i++)
        cnt[(rkey(src[i], sel) >> shift) & 0xFFFFu]++;
    uint32_t sum = 0;
    for (uint32_t d = 0; d < RADIX_SIZE; d++) {
        uint32_t c = cnt[d];
        cnt[d] = sum;
        sum += c;
    }
    for (size_t i = 0; i < n; i++) {
        uint32_t dg = (rkey(src[i], sel) >> shift) & 0xFFFFu;
        dst[cnt[dg]++] = src[i];
    }
}

/* 12 stable LSD passes over (id, timestamp, score-desc) keys. Fully general. */
static const Record* radix_sort(const Record* input, Record* bufA, Record* bufB, size_t n, uint32_t* cnt) {
    const Record* src = input;
    Record* dst = bufA;
    for (int pass = 0; pass < 12; pass++) {
        radix_pass(src, dst, n, pass >> 2, (pass & 3) << 4, cnt);
        src = dst;
        dst = (dst == bufA) ? bufB : bufA;
    }
    return src;
}

struct HashWriter {
    SHA256* hasher;
    char buf[65536];
    size_t pos = 0;

    void byte(char b) {
        if (pos == sizeof(buf)) {
            hasher->update(reinterpret_cast<const uint8_t*>(buf), pos);
            pos = 0;
        }
        buf[pos++] = b;
    }
    void i64(int64_t v) {
        if (v == INT64_MIN) {
            static const char m[] = "-9223372036854775808";
            for (size_t i = 0; i < sizeof(m) - 1; i++) byte(m[i]);
            return;
        }
        if (v < 0) { byte('-'); v = -v; }
        char tmp[20];
        int len = 0;
        do { tmp[len++] = static_cast<char>('0' + v % 10); v /= 10; } while (v);
        while (len > 0) byte(tmp[--len]);
    }
    void flush() {
        if (pos > 0) {
            hasher->update(reinterpret_cast<const uint8_t*>(buf), pos);
            pos = 0;
        }
    }
};

json kernel(const std::vector<Record>& inputRecords, std::vector<Record>& bufA, std::vector<Record>& bufB, std::vector<uint32_t>& counts) {
    const size_t n = inputRecords.size();
    const int take = static_cast<int>(std::min<size_t>(n, 10));

    const Record* recs = radix_sort(inputRecords.data(), bufA.data(), bufB.data(), n, counts.data());

    SHA256 hasher;
    HashWriter w{&hasher};
    for (size_t j = 0; j < n; j++) {
        w.i64(recs[j].id); w.byte(',');
        w.i64(recs[j].score); w.byte(',');
        w.i64(recs[j].timestamp); w.byte('\n');
    }
    w.flush();

    json outputJson;
    outputJson["benchmark"] = "record-sorting";
    outputJson["version"] = 1;
    outputJson["recordCount"] = n;

    json firstArr = json::array();
    for (int j = 0; j < take; j++) {
        firstArr.push_back({{"id", recs[j].id}, {"score", recs[j].score}, {"timestamp", recs[j].timestamp}});
    }
    json lastArr = json::array();
    for (size_t j = n - take; j < n; j++) {
        lastArr.push_back({{"id", recs[j].id}, {"score", recs[j].score}, {"timestamp", recs[j].timestamp}});
    }
    outputJson["firstRecords"] = std::move(firstArr);
    outputJson["lastRecords"] = std::move(lastArr);
    outputJson["checksum"] = hasher.hex();
    return outputJson;
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
        std::cerr << "Usage: record-sorting --input <file> --output <file> --protocol-version 2.0.0" << std::endl;
        return 1;
    }

    json inputJson = json::parse(readFile(inputPath));
    std::vector<Record> inputRecords;
    inputRecords.reserve(inputJson["records"].size());
    for (auto& r : inputJson["records"]) {
        inputRecords.push_back({r["id"].get<int64_t>(), r["score"].get<int64_t>(), r["timestamp"].get<int64_t>()});
    }
    std::vector<Record> bufA(inputRecords.size());
    std::vector<Record> bufB(inputRecords.size());
    std::vector<uint32_t> counts(RADIX_SIZE);

    emitLine({{"type", "ready"}, {"protocolVersion", PROTOCOL_VERSION}});

    std::string lastOutput;
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        auto msg = json::parse(line);
        const std::string& type = msg["type"].get<std::string>();
        if (type == "run") {
            int64_t requestId = msg["requestId"].get<int64_t>();
            lastOutput = kernel(inputRecords, bufA, bufB, counts).dump();
            emitLine({{"type", "result"}, {"requestId", requestId}, {"digest", digestBytes(lastOutput)}});
        } else if (type == "finish") {
            std::ofstream outFile(outputPath);
            outFile << lastOutput;
            emitLine({{"type", "finish"}, {"digest", digestBytes(lastOutput)}});
            break;
        }
    }

    return 0;
}
