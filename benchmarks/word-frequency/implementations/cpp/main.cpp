#include <algorithm>
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

Output kernel(const std::vector<std::string>& words) {
    std::unordered_map<std::string, int> freq;
    freq.reserve(words.size() / 4);
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

    size_t bufCap = 0;
    for (const auto& e : entries) {
        bufCap += e.word.size() + 24;
    }
    bufCap += 32;
    std::string buf;
    buf.reserve(bufCap);
    for (const auto& e : entries) {
        buf.append(e.word);
        buf.push_back(',');
        char numbuf[16];
        int len = std::snprintf(numbuf, sizeof(numbuf), "%d", e.count);
        buf.append(numbuf, len);
        buf.push_back('\n');
    }

    SHA256 hasher;
    hasher.update(buf);

    int topCount = std::min(10, static_cast<int>(entries.size()));
    std::vector<Entry> top(entries.begin(), entries.begin() + topCount);

    Output out;
    out.benchmark = "word-frequency";
    out.version = 1;
    out.totalWords = static_cast<int>(words.size());
    out.uniqueWords = static_cast<int>(entries.size());
    out.topWords = std::move(top);
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

static json outputJson(const Output& out) {
    json output;
    output["benchmark"] = out.benchmark;
    output["version"] = out.version;
    output["totalWords"] = out.totalWords;
    output["uniqueWords"] = out.uniqueWords;
    output["topWords"] = json::array();
    for (const auto& e : out.topWords) {
        output["topWords"].push_back({{"word", e.word}, {"count", e.count}});
    }
    output["checksum"] = out.checksum;
    return output;
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
        std::cerr << "Usage: word-frequency --input <file> --output <file> --protocol-version 2.0.0" << std::endl;
        return 1;
    }

    json inputJson = json::parse(readFile(inputPath));
    std::vector<std::string> words;
    for (const auto& w : inputJson["words"]) {
        words.push_back(w.get<std::string>());
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
            lastOutput = outputJson(kernel(words)).dump();
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
