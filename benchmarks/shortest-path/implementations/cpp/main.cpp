#include <cstdint>
#include <algorithm>
#include <cstring>
#include <fstream>
#include <iostream>
#include <limits>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "json.hpp"
#include "sha256.hpp"

using json = nlohmann::json;

static const char* PROTOCOL_VERSION = "2.0.0";

struct Query {
    int id;
    int source;
    int destination;
};

struct Runner {
    int V;
    std::vector<int> offsets;   // V+1
    std::vector<int> dst;       // E
    std::vector<int64_t> wgt;   // E
    std::vector<int> qid;
    std::vector<int> qsrc;
    std::vector<int> qdst;
    std::vector<int> groupSrc;              // distinct sources
    std::vector<std::vector<int>> members;  // query indices per group
    // scratch, reused across runs
    std::vector<int64_t> dist;
    std::vector<int> prev;
    std::vector<int> seen;    // epoch stamp
    std::vector<int> tmark;   // target stamp
    int epoch = 0;
    int tepoch = 0;
    std::vector<int64_t> hcost;
    std::vector<int> hnode;
};

static inline void heapPush(Runner& r, int& n, int64_t cost, int node) {
    if (n == (int)r.hcost.size()) {
        r.hcost.resize(r.hcost.size() * 2 + 64);
        r.hnode.resize(r.hcost.size());
    }
    int i = n++;
    while (i > 0) {
        int p = (i - 1) >> 1;
        if (r.hcost[p] <= cost) break;
        r.hcost[i] = r.hcost[p];
        r.hnode[i] = r.hnode[p];
        i = p;
    }
    r.hcost[i] = cost;
    r.hnode[i] = node;
}

static inline int64_t heapPop(Runner& r, int& n, int& node) {
    int64_t top = r.hcost[0];
    node = r.hnode[0];
    int last = --n;
    if (last > 0) {
        int64_t lc = r.hcost[last];
        int ln = r.hnode[last];
        int i = 0;
        for (;;) {
            int l = 2 * i + 1;
            if (l >= last) break;
            int rr = l + 1;
            int s = (rr < last && r.hcost[rr] < r.hcost[l]) ? rr : l;
            if (r.hcost[s] >= lc) break;
            r.hcost[i] = r.hcost[s];
            r.hnode[i] = r.hnode[s];
            i = s;
        }
        r.hcost[i] = lc;
        r.hnode[i] = ln;
    }
    return top;
}

struct Result {
    int id;
    std::optional<int64_t> distance;
    std::vector<int> path;
};

std::vector<Result> kernel(Runner& r) {
    const int Q = (int)r.qid.size();
    std::vector<int64_t> outDist(Q);
    std::vector<char> hasDist(Q);
    std::vector<std::vector<int>> outPath(Q);

    for (size_t gi = 0; gi < r.groupSrc.size(); gi++) {
        int src = r.groupSrc[gi];
        const std::vector<int>& mem = r.members[gi];
        int cur = ++r.epoch;
        int tc = ++r.tepoch;
        int rem = 0;
        for (int qi : mem) {
            int d = r.qdst[qi];
            if (d != src && r.tmark[d] != tc) {
                r.tmark[d] = tc;
                rem++;
            }
        }
        r.dist[src] = 0;
        r.seen[src] = cur;
        r.prev[src] = -1;
        int hlen = 0;
        heapPush(r, hlen, 0, src);
        while (hlen > 0 && rem > 0) {
            int u;
            int64_t cost = heapPop(r, hlen, u);
            if (r.seen[u] != cur || cost != r.dist[u]) continue;
            if (r.tmark[u] == tc) {
                r.tmark[u] = 0;
                if (--rem == 0) break;
            }
            int base = r.offsets[u];
            int end = r.offsets[u + 1];
            for (int ei = base; ei < end; ei++) {
                int to = r.dst[ei];
                int64_t nc = cost + r.wgt[ei];
                if (r.seen[to] != cur || nc < r.dist[to]) {
                    r.seen[to] = cur;
                    r.dist[to] = nc;
                    r.prev[to] = u;
                    heapPush(r, hlen, nc, to);
                }
            }
        }
        for (int qi : mem) {
            int d = r.qdst[qi];
            if (d == src) {
                hasDist[qi] = 1;
                outDist[qi] = 0;
                outPath[qi] = {src};
            } else if (r.seen[d] != cur) {
                hasDist[qi] = 0;
                outPath[qi].clear();
            } else {
                hasDist[qi] = 1;
                outDist[qi] = r.dist[d];
                std::vector<int>& p = outPath[qi];
                p.clear();
                for (int x = d;; x = r.prev[x]) {
                    p.push_back(x);
                    if (x == src) break;
                }
                std::reverse(p.begin(), p.end());
            }
        }
    }

    std::vector<Result> results;
    results.reserve(Q);
    for (int i = 0; i < Q; i++) {
        if (hasDist[i])
            results.push_back({r.qid[i], outDist[i], std::move(outPath[i])});
        else
            results.push_back({r.qid[i], std::nullopt, std::move(outPath[i])});
    }
    return results;
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

static json outputJson(const std::vector<Result>& results) {
    json output;
    output["benchmark"] = "shortest-path";
    output["version"] = 1;
    output["results"] = json::array();
    for (const auto& r : results) {
        json entry;
        entry["queryId"] = r.id;
        if (r.distance) {
            entry["distance"] = *r.distance;
        } else {
            entry["distance"] = nullptr;
        }
        entry["path"] = r.path;
        output["results"].push_back(entry);
    }
    return output;
}

int main(int argc, char* argv[]) {
    if (getArg(argc, argv, "--protocol-version") != PROTOCOL_VERSION) {
        std::cerr << "unsupported protocol version" << std::endl;
        return 1;
    }

    std::string inputPath = getArg(argc, argv, "--input");
    std::string outputPath = getArg(argc, argv, "--output");
    if (inputPath.empty() || outputPath.empty()) {
        std::cerr << "Usage: shortest-path --input <file> --output <file> --protocol-version 2.0.0" << std::endl;
        return 1;
    }

    std::ifstream in(inputPath);
    json inputJson;
    in >> inputJson;

    Runner r;
    r.V = inputJson["vertexCount"].get<int>();
    int V = r.V;
    std::vector<int> degree(V, 0);
    size_t E = inputJson["edges"].size();
    for (const auto& e : inputJson["edges"]) {
        int from = e["from"];
        degree[from]++;
    }
    r.offsets.assign(V + 1, 0);
    for (int v = 0; v < V; v++) r.offsets[v + 1] = r.offsets[v] + degree[v];
    r.dst.assign(E, 0);
    r.wgt.assign(E, 0);
    {
        std::vector<int> fill(r.offsets.begin(), r.offsets.begin() + V);
        for (const auto& e : inputJson["edges"]) {
            int from = e["from"];
            int s = fill[from]++;
            int to = e["to"];
            int64_t w = e["weight"];
            r.dst[s] = to;
            r.wgt[s] = w;
        }
    }
    size_t Q = inputJson["queries"].size();
    r.qid.resize(Q);
    r.qsrc.resize(Q);
    r.qdst.resize(Q);
    std::vector<int> srcIndex(V, -1);
    for (size_t i = 0; i < Q; i++) {
        const auto& q = inputJson["queries"][i];
        r.qid[i] = q["id"];
        r.qsrc[i] = q["source"];
        r.qdst[i] = q["destination"];
        int s = r.qsrc[i];
        if (srcIndex[s] < 0) {
            srcIndex[s] = (int)r.groupSrc.size();
            r.groupSrc.push_back(s);
            r.members.emplace_back();
        }
        r.members[srcIndex[s]].push_back((int)i);
    }
    r.dist.assign(V, 0);
    r.prev.assign(V, -1);
    r.seen.assign(V, 0);
    r.tmark.assign(V, 0);
    r.hcost.assign(E + V + 64, 0);
    r.hnode.assign(E + V + 64, 0);

    emitLine({{"type", "ready"}, {"protocolVersion", PROTOCOL_VERSION}});

    std::string lastOutput;
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        auto msg = json::parse(line);
        const std::string& type = msg["type"].get<std::string>();
        if (type == "run") {
            int64_t requestId = msg["requestId"].get<int64_t>();
            lastOutput = outputJson(kernel(r)).dump();
            emitLine({{"type", "result"}, {"requestId", requestId}, {"digest", digestBytes(lastOutput)}});
        } else if (type == "finish") {
            std::ofstream out(outputPath);
            out << lastOutput;
            emitLine({{"type", "finish"}, {"digest", digestBytes(lastOutput)}});
            break;
        }
    }

    return 0;
}
