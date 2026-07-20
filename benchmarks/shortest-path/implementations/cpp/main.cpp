#include <cstdint>
#include <cstring>
#include <fstream>
#include <functional>
#include <iostream>
#include <limits>
#include <optional>
#include <queue>
#include <string>
#include <utility>
#include <vector>

#include "json.hpp"
#include "sha256.hpp"

using json = nlohmann::json;

static const char* PROTOCOL_VERSION = "2.0.0";

struct Edge {
    int from;
    int to;
    int64_t weight;
};

struct Query {
    int id;
    int source;
    int destination;
};

struct Input {
    int vertexCount;
    std::vector<Edge> edges;
    std::vector<Query> queries;
};

struct Result {
    int id;
    std::optional<int64_t> distance;
    std::vector<int> path;
};

using PQItem = std::pair<int64_t, int>;

Input parseInput(const json& j) {
    Input input;
    input.vertexCount = j["vertexCount"].get<int>();
    for (const auto& e : j["edges"]) {
        input.edges.push_back({e["from"].get<int>(), e["to"].get<int>(), e["weight"].get<int64_t>()});
    }
    for (const auto& q : j["queries"]) {
        input.queries.push_back({q["id"].get<int>(), q["source"].get<int>(), q["destination"].get<int>()});
    }
    return input;
}

std::vector<std::vector<Edge>> buildAdjacency(const Input& input) {
    std::vector<std::vector<Edge>> adj(input.vertexCount);
    for (const auto& e : input.edges) {
        adj[e.from].push_back(e);
    }
    return adj;
}

std::vector<Result> kernel(const std::vector<std::vector<Edge>>& adj, const Input& input) {
    constexpr int64_t INF = std::numeric_limits<int64_t>::max();
    std::vector<Result> results;
    results.reserve(input.queries.size());

    const int V = input.vertexCount;
    std::vector<int64_t> dist(V);
    std::vector<int> prev(V);

    for (const auto& q : input.queries) {
        std::fill(dist.begin(), dist.end(), INF);
        std::fill(prev.begin(), prev.end(), -1);
        dist[q.source] = 0;

        std::priority_queue<PQItem, std::vector<PQItem>, std::greater<PQItem>> pq;
        pq.push({0, q.source});

        while (!pq.empty()) {
            auto [cost, node] = pq.top();
            pq.pop();

            if (cost != dist[node]) continue;

            if (node == q.destination) break;

            for (const auto& edge : adj[node]) {
                int64_t nextCost = cost + edge.weight;
                if (nextCost < dist[edge.to]) {
                    dist[edge.to] = nextCost;
                    prev[edge.to] = node;
                    pq.push({nextCost, edge.to});
                }
            }
        }

        if (dist[q.destination] == INF) {
            results.push_back({q.id, std::nullopt, {}});
        } else {
            std::vector<int> path;
            for (int v = q.destination; v != -1; v = prev[v]) {
                path.push_back(v);
            }
            std::reverse(path.begin(), path.end());
            results.push_back({q.id, dist[q.destination], std::move(path)});
        }
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
    Input input = parseInput(inputJson);
    auto adjacency = buildAdjacency(input);

    emitLine({{"type", "ready"}, {"protocolVersion", PROTOCOL_VERSION}});

    std::string lastOutput;
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        auto msg = json::parse(line);
        const std::string& type = msg["type"].get<std::string>();
        if (type == "run") {
            int64_t requestId = msg["requestId"].get<int64_t>();
            lastOutput = outputJson(kernel(adjacency, input)).dump();
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
