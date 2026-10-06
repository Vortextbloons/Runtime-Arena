#include <cstdlib>
#include <cstring>
#include <algorithm>
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

static inline char* appendInt64(char* p, int64_t v) {
    if (v == 0) {
        *p++ = '0';
        *p++ = ',';
        return p;
    }
    if (v < 0) {
        *p++ = '-';
        v = -v;
    }
    char tmp[20];
    int len = 0;
    while (v > 0) {
        tmp[len++] = static_cast<char>('0' + v % 10);
        v /= 10;
    }
    while (len > 0) *p++ = tmp[--len];
    *p++ = ',';
    return p;
}

Output kernel(const Input& in, std::vector<int64_t>& c, std::vector<int64_t>& bt) {
    const int n = in.dimension;
    const int64_t* __restrict__ a = in.left.data();
    const int64_t* __restrict__ b = in.right.data();
    int64_t* __restrict__ cc = c.data();
    int64_t* __restrict__ tr = bt.data();
    int64_t valueSum = 0;
    int64_t diagonalSum = 0;

    /* Blocked transpose of B so the cubic loop streams sequentially. */
    for (int ii = 0; ii < n; ii += 32) {
        int iMax = std::min(ii + 32, n);
        for (int jj = 0; jj < n; jj += 32) {
            int jMax = std::min(jj + 32, n);
            for (int i = ii; i < iMax; i++) {
                const int64_t* rrow = b + static_cast<size_t>(i) * n;
                for (int j = jj; j < jMax; j++) tr[static_cast<size_t>(j) * n + i] = rrow[j];
            }
        }
    }

    /* Row/row dot products with 4-way unrolled accumulator parallelism. */
    const int kLim = n & ~3;
    for (int i = 0; i < n; i++) {
        const int64_t* arow = a + static_cast<size_t>(i) * n;
        int64_t* crow = cc + static_cast<size_t>(i) * n;
        int64_t rowSum = 0;
        for (int j = 0; j < n; j++) {
            const int64_t* brow = tr + static_cast<size_t>(j) * n;
            int64_t s0 = 0, s1 = 0, s2 = 0, s3 = 0;
            for (int k = 0; k < kLim; k += 4) {
                s0 += arow[k] * brow[k];
                s1 += arow[k + 1] * brow[k + 1];
                s2 += arow[k + 2] * brow[k + 2];
                s3 += arow[k + 3] * brow[k + 3];
            }
            int64_t s = (s0 + s1) + (s2 + s3);
            for (int k = kLim; k < n; k++) s += arow[k] * brow[k];
            crow[j] = s;
            rowSum += s;
            if (i == j) diagonalSum += s;
        }
        valueSum += rowSum;
    }

    size_t bufCap = static_cast<size_t>(n) * n * 24 + 256;
    char* buf = static_cast<char*>(std::malloc(bufCap));
    char* p = buf + std::snprintf(buf, bufCap, "dimension=%d\n", n);
    const size_t nn = static_cast<size_t>(n) * n;
    for (size_t i = 0; i < nn; i++) p = appendInt64(p, cc[i]);
    *p++ = '\n';
    size_t bufLen = static_cast<size_t>(p - buf);

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
    std::vector<int64_t> bt(in.dimension * in.dimension);

    emitLine({{"type", "ready"}, {"protocolVersion", PROTOCOL_VERSION}});

    std::string lastOutput;
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        auto msg = json::parse(line);
        const std::string& type = msg["type"].get<std::string>();
        if (type == "run") {
            int64_t requestId = msg["requestId"].get<int64_t>();
            lastOutput = outputJson(kernel(in, c, bt)).dump();
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
