#include "json.hpp"
#include "sha256.hpp"
#include <atomic>
#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

using json = nlohmann::json;

static const char* PROTOCOL_VERSION = "2.0.0";

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

static inline uint32_t mix32(uint32_t x) {
    x ^= x >> 16;
    x *= 0x21f0aaad;
    x ^= x >> 15;
    x *= 0x735a2d97;
    x ^= x >> 15;
    return x;
}

static inline uint64_t rotateLeft64(uint64_t x, unsigned n) {
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

/* Single reusable barrier for N parties: one broadcast wakes everyone,
 * replacing per-worker futex ping-pong with two syscalls per phase. */
class Barrier {
public:
    explicit Barrier(unsigned parties) : parties_(parties) {}
    void arrive_and_wait() {
        std::unique_lock<std::mutex> lock(mutex_);
        unsigned gen = cycle_;
        if (++count_ == parties_) {
            count_ = 0;
            ++cycle_;
            cond_.notify_all();
        } else {
            cond_.wait(lock, [&] { return cycle_ != gen; });
        }
    }
private:
    std::mutex mutex_;
    std::condition_variable cond_;
    const unsigned parties_;
    unsigned count_ = 0;
    unsigned cycle_ = 0;
};

/* One slot per worker, sized to 128 bytes so slots never share a line. */
struct alignas(64) Slot {
    uint32_t seed = 0;
    uint32_t xorv = 0;
    uint64_t sum = 0;
    char pad[112] = {};
};
static_assert(sizeof(Slot) % 64 == 0, "slot must be line-multiple");

struct Shared {
    Input in;
    std::vector<Slot> slots;
    Barrier dispatch;
    Barrier complete;
    std::atomic<bool> shouldStop{false};
    explicit Shared(const Input& in_)
        : in(in_), slots(in_.workerCount),
          dispatch(in_.workerCount + 1), complete(in_.workerCount + 1) {}
};

#define XROUND(x) do { \
    x ^= x << 13;      \
    x ^= x >> 17;      \
    x ^= x << 5;       \
    x = x * 0x9e3779b1u + 0x85ebca77u; \
} while (0)

static void workerFn(Shared* s, int id) {
    const int items = s->in.itemsPerWorker;
    const int rounds = s->in.roundsPerItem;
    const uint32_t base = (uint32_t)(id * items);
    const uint32_t workerMul = (uint32_t)id * 0x9e3779b9u;
    const int n4 = items & ~3;
    Slot& slot = s->slots[id];

    while (true) {
        s->dispatch.arrive_and_wait();
        if (s->shouldStop.load(std::memory_order_relaxed)) break;
        const uint32_t phaseSeed = slot.seed;

        uint32_t xor0 = 0, xor1 = 0, xor2 = 0, xor3 = 0;
        uint64_t sum0 = 0, sum1 = 0, sum2 = 0, sum3 = 0;
        int item = 0;
        for (; item < n4; item += 4) {
            uint32_t x0 = phaseSeed ^ (base + (uint32_t)item) ^ workerMul;
            uint32_t x1 = phaseSeed ^ (base + (uint32_t)item + 1u) ^ workerMul;
            uint32_t x2 = phaseSeed ^ (base + (uint32_t)item + 2u) ^ workerMul;
            uint32_t x3 = phaseSeed ^ (base + (uint32_t)item + 3u) ^ workerMul;
            for (int r = 0; r < rounds; r++) {
                XROUND(x0); XROUND(x1); XROUND(x2); XROUND(x3);
            }
            xor0 ^= x0; sum0 += x0;
            xor1 ^= x1; sum1 += x1;
            xor2 ^= x2; sum2 += x2;
            xor3 ^= x3; sum3 += x3;
        }
        uint32_t xorT = 0;
        uint64_t sumT = 0;
        for (; item < items; item++) {
            uint32_t x = phaseSeed ^ (base + (uint32_t)item) ^ workerMul;
            for (int r = 0; r < rounds; r++) XROUND(x);
            xorT ^= x; sumT += x;
        }
        slot.xorv = xor0 ^ xor1 ^ xor2 ^ xor3 ^ xorT;
        slot.sum = sum0 + sum1 + sum2 + sum3 + sumT;

        s->complete.arrive_and_wait();
    }
    /* Coordinator waits in complete after the stop dispatch. */
    s->complete.arrive_and_wait();
}

static Output kernel(Shared& s) {
    const Input& in = s.in;
    uint32_t phaseSeed = in.initialSeed;
    uint64_t digest = 0x6a09e667f3bcc909ULL;

    for (int phase = 0; phase < in.phaseCount; phase++) {
        for (int w = 0; w < in.workerCount; w++)
            s.slots[w].seed = phaseSeed;
        s.dispatch.arrive_and_wait();
        s.complete.arrive_and_wait();

        uint32_t nextSeed = phaseSeed ^ (uint32_t)phase;
        uint64_t phaseSum = 0;
        for (int w = 0; w < in.workerCount; w++) {
            const Slot& r = s.slots[w];
            nextSeed = mix32(nextSeed ^ r.xorv ^ (uint32_t)r.sum ^ (uint32_t)(r.sum >> 32) ^ (uint32_t)w);
            phaseSum += r.sum;
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
        {"schemaVersion", out.schemaVersion},
        {"benchmark", out.benchmark},
        {"workerCount", out.workerCount},
        {"phaseCount", out.phaseCount},
        {"itemsProcessed", out.itemsProcessed},
        {"finalSeed", out.finalSeed},
        {"digest", out.digest}
    };
}

int main(int argc, char* argv[]) {
    if (getArg(argc, argv, "--protocol-version") != PROTOCOL_VERSION) {
        std::cerr << "unsupported protocol version" << std::endl;
        return 1;
    }

    std::string inputFile = getArg(argc, argv, "--input");
    std::string outputFile = getArg(argc, argv, "--output");
    if (inputFile.empty() || outputFile.empty()) {
        std::cerr << "Usage: barrier-wave --input <file> --output <file> --protocol-version 2.0.0" << std::endl;
        return 1;
    }

    std::string inputStr;
    {
        std::ifstream f(inputFile, std::ios::binary);
        inputStr.assign(std::istreambuf_iterator<char>(f), std::istreambuf_iterator<char>());
    }
    auto jin = json::parse(inputStr);
    Input in;
    in.schemaVersion = jin["schemaVersion"].get<std::string>();
    in.workerCount = jin["workerCount"].get<int>();
    in.phaseCount = jin["phaseCount"].get<int>();
    in.itemsPerWorker = jin["itemsPerWorker"].get<int>();
    in.roundsPerItem = jin["roundsPerItem"].get<int>();
    in.initialSeed = parseHexSeed(jin["initialSeed"].get<std::string>());

    Shared shared(in);
    std::vector<std::thread> threads;
    for (int i = 0; i < in.workerCount; i++)
        threads.emplace_back(workerFn, &shared, i);

    emitLine({{"type", "ready"}, {"protocolVersion", PROTOCOL_VERSION}});

    std::string lastOutput;
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        auto msg = json::parse(line);
        const std::string& type = msg["type"].get<std::string>();
        if (type == "run") {
            int64_t requestId = msg["requestId"].get<int64_t>();
            lastOutput = outputJson(kernel(shared)).dump();
            emitLine({{"type", "result"}, {"requestId", requestId}, {"digest", digestBytes(lastOutput)}});
        } else if (type == "finish") {
            std::ofstream out(outputFile, std::ios::binary);
            out << lastOutput;
            emitLine({{"type", "finish"}, {"digest", digestBytes(lastOutput)}});
            break;
        }
    }

    shared.shouldStop.store(true, std::memory_order_relaxed);
    shared.dispatch.arrive_and_wait();
    shared.complete.arrive_and_wait();
    for (auto& t : threads)
        t.join();

    return 0;
}
