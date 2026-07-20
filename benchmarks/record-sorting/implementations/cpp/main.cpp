#include <algorithm>
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

json kernel(const std::vector<Record>& inputRecords) {
    std::vector<Record> recs = inputRecords;
    const int n = static_cast<int>(recs.size());
    const int take = std::min(n, 10);

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

    json outputJson;
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
    for (auto& r : inputJson["records"]) {
        inputRecords.push_back({r["id"].get<int64_t>(), r["score"].get<int64_t>(), r["timestamp"].get<int64_t>()});
    }

    emitLine({{"type", "ready"}, {"protocolVersion", PROTOCOL_VERSION}});

    std::string lastOutput;
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        auto msg = json::parse(line);
        const std::string& type = msg["type"].get<std::string>();
        if (type == "run") {
            int64_t requestId = msg["requestId"].get<int64_t>();
            lastOutput = kernel(inputRecords).dump();
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
