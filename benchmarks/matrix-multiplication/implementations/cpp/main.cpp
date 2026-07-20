#include <cstdlib>
#include <cstring>
#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "json.hpp"
#include "sha256.hpp"

using json = nlohmann::json;

static const char* PROTOCOL_VERSION = "2.0.0";

struct Input {
    int dimension;
    std::vector<int64_t> left;
    std::vector<int64_t> right;
};

struct Output {
    std::string benchmark;
    int version;
    int dimension;
    int elementCount;
    int64_t valueSum;
    int64_t diagonalSum;
    std::string checksum;
};

Input parseInput(const json& j) {
    Input in;
    in.dimension = j["dimension"].get<int>();
    for (auto& v : j["left"]) in.left.push_back(v.get<int64_t>());
    for (auto& v : j["right"]) in.right.push_back(v.get<int64_t>());
    return in;
}

Output kernel(const Input& in, std::vector<int64_t>& c) {
    const int n = in.dimension;
    const int64_t* a = in.left.data();
    const int64_t* b = in.right.data();
    int64_t valueSum = 0;
    int64_t diagonalSum = 0;

    std::memset(c.data(), 0, n * n * sizeof(int64_t));

    for (int i = 0; i < n; i++) {
        for (int k = 0; k < n; k++) {
            int64_t aik = a[i * n + k];
            for (int j = 0; j < n; j++) {
                c[i * n + j] += aik * b[k * n + j];
            }
        }
    }

    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            valueSum += c[i * n + j];
            if (i == j) diagonalSum += c[i * n + j];
        }
    }

    size_t bufCap = static_cast<size_t>(n) * n * 21 + 256;
    char* buf = static_cast<char*>(std::malloc(bufCap));
    int bufLen = std::snprintf(buf, bufCap, "dimension=%d\n", n);
    for (int i = 0; i < n * n; i++) {
        bufLen += std::snprintf(buf + bufLen, bufCap - bufLen, "%lld,", static_cast<long long>(c[i]));
    }
    bufLen += std::snprintf(buf + bufLen, bufCap - bufLen, "\n");

    SHA256 hasher;
    hasher.update(reinterpret_cast<const uint8_t*>(buf), bufLen);
    std::free(buf);

    Output out;
    out.benchmark = "matrix-multiplication";
    out.version = 1;
    out.dimension = n;
    out.elementCount = n * n;
    out.valueSum = valueSum;
    out.diagonalSum = diagonalSum;
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

static json outputJson(const Output& out) {
    return {
        {"benchmark", out.benchmark},
        {"version", out.version},
        {"dimension", out.dimension},
        {"elementCount", out.elementCount},
        {"valueSum", out.valueSum},
        {"diagonalSum", out.diagonalSum},
        {"checksum", out.checksum}
    };
}

int main(int argc, char* argv[]) {
    if (getArg(argc, argv, "--protocol-version") != PROTOCOL_VERSION) {
        std::cerr << "unsupported protocol version" << std::endl;
        return 1;
    }

    std::string inputPath = getArg(argc, argv, "--input");
    std::string outputPath = getArg(argc, argv, "--output");
    if (inputPath.empty() || outputPath.empty()) {
        std::cerr << "Usage: matrix-multiplication --input <file> --output <file> --protocol-version 2.0.0" << std::endl;
        return 1;
    }

    json inputJson = json::parse(readFile(inputPath));
    Input in = parseInput(inputJson);
    std::vector<int64_t> c(in.dimension * in.dimension);

    emitLine({{"type", "ready"}, {"protocolVersion", PROTOCOL_VERSION}});

    std::string lastOutput;
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        auto msg = json::parse(line);
        const std::string& type = msg["type"].get<std::string>();
        if (type == "run") {
            int64_t requestId = msg["requestId"].get<int64_t>();
            lastOutput = outputJson(kernel(in, c)).dump();
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
