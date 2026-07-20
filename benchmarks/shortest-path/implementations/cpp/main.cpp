#include <chrono>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <functional>
#include <limits>
#include <optional>
#include <queue>
#include <string>
#include <utility>
#include <vector>

#include "json.hpp"

using json = nlohmann::json;

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

struct Sample {
    int iteration;
    int64_t kernelTimeNanoseconds;
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

static const double T_CRITICAL[30] = {0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045};
double ciWidth(const std::vector<long long>& samples) {
    const size_t n = samples.size();
    if (n < 2) return std::numeric_limits<double>::infinity();
    double mean = 0;
    for (long long value : samples) mean += static_cast<double>(value);
    mean /= static_cast<double>(n);
    if (mean <= 0) return std::numeric_limits<double>::infinity();
    double variance = 0;
    for (long long value : samples) { const double delta = static_cast<double>(value) - mean; variance += delta * delta; }
    variance /= static_cast<double>(n - 1);
    const double t = n < 30 ? T_CRITICAL[n] : 2.0;
    return (2.0 * t * std::sqrt(variance / static_cast<double>(n))) / mean;
}

int main(int argc, char* argv[]) {
    std::string inputFile;
    std::string outputFile;
    std::string timingFile;
    int warmup = 0;
    int minIterations = 1;
    int maxIterations = 1;
    double targetCi = 0.05;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--input" && i + 1 < argc) inputFile = argv[++i];
        else if (arg == "--output" && i + 1 < argc) outputFile = argv[++i];
        else if (arg == "--timing-output" && i + 1 < argc) timingFile = argv[++i];
        else if (arg == "--warmup" && i + 1 < argc) warmup = std::stoi(argv[++i]);
        else if (arg == "--min-iterations" && i + 1 < argc) minIterations = std::stoi(argv[++i]);
        else if (arg == "--max-iterations" && i + 1 < argc) maxIterations = std::stoi(argv[++i]);
        else if (arg == "--target-relative-ci" && i + 1 < argc) targetCi = std::stod(argv[++i]);
    }

    std::ifstream in(inputFile);
    json inputJson;
    in >> inputJson;
    Input input = parseInput(inputJson);
    auto adjacency = buildAdjacency(input);

    std::vector<Sample> samples;
    std::vector<Result> results;

    std::vector<long long> kernelTimes;
    for (int i = -warmup; ; i++) {
        auto start = std::chrono::high_resolution_clock::now();
        results = kernel(adjacency, input);
        auto end = std::chrono::high_resolution_clock::now();
        int64_t elapsed = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count();
        if (elapsed < 1) elapsed = 1;
        if (i >= 0) {
            kernelTimes.push_back(elapsed);
            samples.push_back({static_cast<int>(samples.size()) + 1, elapsed});
            if (static_cast<int>(kernelTimes.size()) >= maxIterations || (static_cast<int>(kernelTimes.size()) >= minIterations && ciWidth(kernelTimes) <= targetCi)) break;
        }
    }

    json outputJson;
    outputJson["benchmark"] = "shortest-path";
    outputJson["version"] = 1;
    outputJson["results"] = json::array();
    for (const auto& r : results) {
        json entry;
        entry["queryId"] = r.id;
        if (r.distance) {
            entry["distance"] = *r.distance;
        } else {
            entry["distance"] = nullptr;
        }
        entry["path"] = r.path;
        outputJson["results"].push_back(entry);
    }

    std::ofstream out(outputFile);
    out << outputJson.dump();

    json timingJson;
    timingJson["samples"] = json::array();
    for (const auto& s : samples) {
        timingJson["samples"].push_back({{"iteration", s.iteration}, {"kernelTimeNanoseconds", s.kernelTimeNanoseconds}});
    }

    std::ofstream timingOut(timingFile);
    timingOut << timingJson.dump();

    return 0;
}
