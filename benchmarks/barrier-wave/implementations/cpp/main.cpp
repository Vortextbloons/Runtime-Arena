#include "json.hpp"
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

using json = nlohmann::json;

struct Input {
    std::string schemaVersion;
    int workerCount;
    int phaseCount;
    int itemsPerWorker;
    int roundsPerItem;
    uint32_t initialSeed;
};

struct Output {
    std::string schemaVersion;
    std::string benchmark;
    int workerCount;
    int phaseCount;
    int64_t itemsProcessed;
    std::string finalSeed;
    std::string digest;
};

struct Sample {
    int iteration;
    int64_t kernelTimeNanoseconds;
};

struct WorkerResult {
    uint32_t localXor;
    uint64_t localSum;
};

static uint32_t mix32(uint32_t x) {
    x ^= x >> 16;
    x *= 0x21f0aaad;
    x ^= x >> 15;
    x *= 0x735a2d97;
    x ^= x >> 15;
    return x;
}

static uint64_t rotateLeft64(uint64_t x, unsigned n) {
    return (x << n) | (x >> (64 - n));
}

static std::string toHex8(uint32_t v) {
    char buf[9];
    snprintf(buf, sizeof(buf), "%08x", v);
    return std::string(buf);
}

static std::string toHex16(uint64_t v) {
    char buf[17];
    snprintf(buf, sizeof(buf), "%016llx", (unsigned long long)v);
    return std::string(buf);
}

static uint32_t parseHexSeed(const std::string& s) {
    return (uint32_t)strtoul(s.c_str(), nullptr, 16);
}

struct Worker {
    int id;
    int itemsPerWorker;
    int roundsPerItem;
    std::mutex mtx;
    std::condition_variable cv;
    bool hasWork = false;
    bool isDone = false;
    bool shouldStop = false;
    uint32_t seed = 0;
    WorkerResult result{};
};

static void workerFn(Worker* w) {
    while (true) {
        std::unique_lock lock(w->mtx);
        w->cv.wait(lock, [&] { return w->hasWork || w->shouldStop; });
        if (w->shouldStop) break;
        uint32_t phaseSeed = w->seed;
        w->hasWork = false;
        lock.unlock();

        uint32_t workerMul = (uint32_t)w->id * 0x9e3779b9u;
        uint32_t localXor = 0;
        uint64_t localSum = 0;

        for (int item = 0; item < w->itemsPerWorker; item++) {
            uint32_t globalItemId = (uint32_t)(w->id * w->itemsPerWorker + item);
            uint32_t x = phaseSeed ^ globalItemId ^ workerMul;
            for (int r = 0; r < w->roundsPerItem; r++) {
                x ^= x << 13;
                x ^= x >> 17;
                x ^= x << 5;
                x = x * 0x9e3779b1u + 0x85ebca77u;
            }
            localXor ^= x;
            localSum += x;
        }

        lock.lock();
        w->result.localXor = localXor;
        w->result.localSum = localSum;
        w->isDone = true;
        w->cv.notify_one();
    }
}

static Output kernel(const Input& in, std::vector<Worker>& workers) {
    uint32_t phaseSeed = in.initialSeed;
    uint64_t digest = 0x6a09e667f3bcc909ULL;

    for (int phase = 0; phase < in.phaseCount; phase++) {
        for (auto& w : workers) {
            std::lock_guard lock(w.mtx);
            w.seed = phaseSeed;
            w.hasWork = true;
            w.isDone = false;
        }
        for (auto& w : workers)
            w.cv.notify_one();

        for (auto& w : workers) {
            std::unique_lock lock(w.mtx);
            w.cv.wait(lock, [&] { return w.isDone; });
        }

        uint32_t nextSeed = phaseSeed ^ (uint32_t)phase;
        uint64_t phaseSum = 0;
        for (int w = 0; w < in.workerCount; w++) {
            auto& r = workers[w].result;
            nextSeed = mix32(nextSeed ^ r.localXor ^ (uint32_t)r.localSum ^ (uint32_t)(r.localSum >> 32) ^ (uint32_t)w);
            phaseSum += r.localSum;
        }

        phaseSeed = nextSeed;
        digest = rotateLeft64(digest, 7);
        digest ^= (uint64_t)phaseSeed;
        digest += phaseSum;
    }

    Output out;
    out.schemaVersion = "1.0.0";
    out.benchmark = "barrier-wave";
    out.workerCount = in.workerCount;
    out.phaseCount = in.phaseCount;
    out.itemsProcessed = (int64_t)in.workerCount * in.phaseCount * in.itemsPerWorker;
    out.finalSeed = toHex8(phaseSeed);
    out.digest = toHex16(digest);
    return out;
}

static std::string getArg(int argc, char* argv[], const char* name) {
    for (int i = 1; i < argc - 1; i++)
        if (strcmp(argv[i], name) == 0) return argv[i + 1];
    return "";
}

int main(int argc, char* argv[]) {
    std::string inputFile = getArg(argc, argv, "--input");
    std::string outputFile = getArg(argc, argv, "--output");
    std::string timingFile = getArg(argc, argv, "--timing-output");
    int warmup = std::stoi(getArg(argc, argv, "--warmup"));
    int iterations = std::stoi(getArg(argc, argv, "--iterations"));

    std::string inputStr;
    {
        FILE* f = fopen(inputFile.c_str(), "rb");
        fseek(f, 0, SEEK_END);
        long sz = ftell(f);
        fseek(f, 0, SEEK_SET);
        inputStr.resize(sz);
        fread(inputStr.data(), 1, sz, f);
        fclose(f);
    }
    auto jin = json::parse(inputStr);
    Input in;
    in.schemaVersion = jin["schemaVersion"].get<std::string>();
    in.workerCount = jin["workerCount"].get<int>();
    in.phaseCount = jin["phaseCount"].get<int>();
    in.itemsPerWorker = jin["itemsPerWorker"].get<int>();
    in.roundsPerItem = jin["roundsPerItem"].get<int>();
    in.initialSeed = parseHexSeed(jin["initialSeed"].get<std::string>());

    std::vector<Worker> workers(in.workerCount);
    for (int i = 0; i < in.workerCount; i++) {
        workers[i].id = i;
        workers[i].itemsPerWorker = in.itemsPerWorker;
        workers[i].roundsPerItem = in.roundsPerItem;
    }

    std::vector<std::thread> threads;
    for (int i = 0; i < in.workerCount; i++)
        threads.emplace_back(workerFn, &workers[i]);

    std::vector<Sample> samples;
    Output out;
    for (int i = -warmup; i < iterations; i++) {
        auto start = std::chrono::high_resolution_clock::now();
        out = kernel(in, workers);
        auto end = std::chrono::high_resolution_clock::now();
        int64_t elapsed = std::max((int64_t)1, std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count());
        if (i >= 0)
            samples.push_back({i + 1, elapsed});
    }

    for (auto& w : workers) {
        std::lock_guard lock(w.mtx);
        w.shouldStop = true;
    }
    for (auto& w : workers)
        w.cv.notify_one();
    for (auto& t : threads)
        t.join();

    json jout;
    jout["schemaVersion"] = out.schemaVersion;
    jout["benchmark"] = out.benchmark;
    jout["workerCount"] = out.workerCount;
    jout["phaseCount"] = out.phaseCount;
    jout["itemsProcessed"] = out.itemsProcessed;
    jout["finalSeed"] = out.finalSeed;
    jout["digest"] = out.digest;
    {
        FILE* f = fopen(outputFile.c_str(), "wb");
        auto s = jout.dump();
        fwrite(s.data(), 1, s.size(), f);
        fclose(f);
    }

    json jtiming;
    jtiming["samples"] = json::array();
    for (auto& s : samples)
        jtiming["samples"].push_back({{"iteration", s.iteration}, {"kernelTimeNanoseconds", s.kernelTimeNanoseconds}});
    {
        FILE* f = fopen(timingFile.c_str(), "wb");
        auto s = jtiming.dump();
        fwrite(s.data(), 1, s.size(), f);
        fclose(f);
    }

    return 0;
}
