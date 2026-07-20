#include "json.hpp"
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <thread>
#include <vector>
#include <limits>

#ifdef _WIN32
#include <windows.h>
#else
#include <condition_variable>
#include <mutex>
#endif

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

#ifdef _WIN32

struct Worker {
    int id;
    int itemsPerWorker;
    int roundsPerItem;
    alignas(64) std::atomic<uint32_t> generation{0};
    alignas(64) std::atomic<uint32_t> doneGen{0};
    alignas(64) std::atomic<uint32_t> shouldStop{0};
    uint32_t seed;
    uint32_t localXor;
    uint64_t localSum;
};

static void workerFn(Worker* w) {
    uint32_t seen = 0;
    while (true) {
        uint32_t cur = w->generation.load(std::memory_order_acquire);
        while (cur == seen) {
            if (w->shouldStop.load(std::memory_order_acquire)) return;
            WaitOnAddress((PVOID)&w->generation, &seen, sizeof(uint32_t), INFINITE);
            cur = w->generation.load(std::memory_order_acquire);
        }
        seen = cur;
        if (w->shouldStop.load(std::memory_order_acquire)) return;

        uint32_t phaseSeed = w->seed;

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

        w->localXor = localXor;
        w->localSum = localSum;

        w->doneGen.fetch_add(1, std::memory_order_release);
        WakeByAddressSingle((PVOID)&w->doneGen);
    }
}

static Output kernel(const Input& in, std::vector<Worker>& workers) {
    uint32_t phaseSeed = in.initialSeed;
    uint64_t digest = 0x6a09e667f3bcc909ULL;
    const int wc = in.workerCount;
    std::vector<uint32_t> targets(wc);

    for (int phase = 0; phase < in.phaseCount; phase++) {
        for (int w = 0; w < wc; w++)
            targets[w] = workers[w].doneGen.load(std::memory_order_relaxed);

        for (auto& w : workers) {
            w.seed = phaseSeed;
        }
        std::atomic_thread_fence(std::memory_order_release);

        for (auto& w : workers) {
            w.generation.fetch_add(1, std::memory_order_release);
            WakeByAddressSingle((PVOID)&w.generation);
        }

        for (int w = 0; w < wc; w++) {
            uint32_t target = targets[w] + 1;
            uint32_t cur = workers[w].doneGen.load(std::memory_order_acquire);
            while (cur < target) {
                WaitOnAddress((PVOID)&workers[w].doneGen, &cur, sizeof(uint32_t), INFINITE);
                cur = workers[w].doneGen.load(std::memory_order_acquire);
            }
        }

        uint32_t nextSeed = phaseSeed ^ (uint32_t)phase;
        uint64_t phaseSum = 0;
        for (int w = 0; w < wc; w++) {
            auto& r = workers[w];
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

#else

struct Worker {
    int id;
    int itemsPerWorker;
    int roundsPerItem;
    std::atomic<uint32_t> generation{0};
    std::atomic<uint32_t> doneGen{0};
    std::atomic<uint32_t> shouldStop{0};
    uint32_t seed = 0;
    uint32_t localXor;
    uint64_t localSum;
    alignas(64) char _pad[0];
};

static void workerFn(Worker* w) {
    uint32_t seen = 0;
    while (true) {
        uint32_t cur = w->generation.load(std::memory_order_acquire);
        while (cur == seen) {
            if (w->shouldStop.load(std::memory_order_acquire)) return;
            w->generation.wait(seen);
            cur = w->generation.load(std::memory_order_acquire);
        }
        seen = cur;
        if (w->shouldStop.load(std::memory_order_acquire)) return;

        uint32_t phaseSeed = w->seed;

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

        w->localXor = localXor;
        w->localSum = localSum;

        w->doneGen.fetch_add(1, std::memory_order_release);
        w->doneGen.notify_one();
    }
}

static Output kernel(const Input& in, std::vector<Worker>& workers) {
    uint32_t phaseSeed = in.initialSeed;
    uint64_t digest = 0x6a09e667f3bcc909ULL;
    const int wc = in.workerCount;
    std::vector<uint32_t> targets(wc);

    for (int phase = 0; phase < in.phaseCount; phase++) {
        for (int w = 0; w < wc; w++)
            targets[w] = workers[w].doneGen.load(std::memory_order_relaxed);

        for (auto& w : workers) {
            w.seed = phaseSeed;
        }
        std::atomic_thread_fence(std::memory_order_release);

        for (auto& w : workers) {
            w.generation.fetch_add(1, std::memory_order_release);
            w.generation.notify_one();
        }

        for (int w = 0; w < wc; w++) {
            uint32_t target = targets[w] + 1;
            uint32_t cur = workers[w].doneGen.load(std::memory_order_acquire);
            while (cur < target) {
                workers[w].doneGen.wait(cur);
                cur = workers[w].doneGen.load(std::memory_order_acquire);
            }
        }

        uint32_t nextSeed = phaseSeed ^ (uint32_t)phase;
        uint64_t phaseSum = 0;
        for (int w = 0; w < wc; w++) {
            auto& r = workers[w];
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

#endif

static std::string getArg(int argc, char* argv[], const char* name) {
    for (int i = 1; i < argc - 1; i++)
        if (strcmp(argv[i], name) == 0) return argv[i + 1];
    return "";
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
    std::string inputFile = getArg(argc, argv, "--input");
    std::string outputFile = getArg(argc, argv, "--output");
    std::string timingFile = getArg(argc, argv, "--timing-output");
    int warmup = std::stoi(getArg(argc, argv, "--warmup"));
    int minIterations = std::stoi(getArg(argc, argv, "--min-iterations"));
    int maxIterations = std::stoi(getArg(argc, argv, "--max-iterations"));
    double targetCi = std::stod(getArg(argc, argv, "--target-relative-ci"));

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
    std::vector<long long> kernelTimes;
    for (int i = -warmup; ; i++) {
        auto start = std::chrono::high_resolution_clock::now();
        out = kernel(in, workers);
        auto end = std::chrono::high_resolution_clock::now();
        int64_t elapsed = std::max((int64_t)1, std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count());
        if (i >= 0) {
            kernelTimes.push_back(elapsed);
            samples.push_back({static_cast<int>(samples.size()) + 1, elapsed});
            if (static_cast<int>(kernelTimes.size()) >= maxIterations
                || (static_cast<int>(kernelTimes.size()) >= minIterations && ciWidth(kernelTimes) <= targetCi))
                break;
        }
    }

#ifdef _WIN32
    for (auto& w : workers) {
        w.shouldStop.store(1, std::memory_order_release);
        w.generation.fetch_add(1, std::memory_order_release);
        WakeByAddressSingle((PVOID)&w.generation);
    }
#else
    for (auto& w : workers) {
        w.shouldStop.store(1, std::memory_order_release);
        w.generation.fetch_add(1, std::memory_order_release);
        w.generation.notify_one();
    }
#endif
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
