#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <pthread.h>
#include "json.h"
#include "sha256.h"

#define PROTOCOL_VERSION "2.0.0"

typedef struct {
    char schemaVersion[16];
    int workerCount;
    int phaseCount;
    int itemsPerWorker;
    int roundsPerItem;
    uint32_t initialSeed;
} Input;

/* Single-mutex reusable barrier shared by all parties (portable). */
typedef struct {
    pthread_mutex_t mtx;
    pthread_cond_t cond;
    unsigned cycle;
    int count;
    int parties;
} Barrier;

static void barrier_init(Barrier *b, int parties) {
    pthread_mutex_init(&b->mtx, NULL);
    pthread_cond_init(&b->cond, NULL);
    b->cycle = 0;
    b->count = 0;
    b->parties = parties;
}

static void barrier_destroy(Barrier *b) {
    pthread_mutex_destroy(&b->mtx);
    pthread_cond_destroy(&b->cond);
}

static void barrier_wait(Barrier *b) {
    pthread_mutex_lock(&b->mtx);
    unsigned gen = b->cycle;
    if (++b->count == b->parties) {
        b->count = 0;
        b->cycle++;
        pthread_cond_broadcast(&b->cond);
        pthread_mutex_unlock(&b->mtx);
    } else {
        while (gen == b->cycle)
            pthread_cond_wait(&b->cond, &b->mtx);
        pthread_mutex_unlock(&b->mtx);
    }
}

/* One slot per worker, padded to its own cache line. Written by the
 * coordinator (seed) and by the owning worker (results); the dispatch and
 * complete barriers provide the happens-before edges. */
typedef struct {
    int id;
    uint32_t seed;
    uint32_t localXor;
    uint64_t localSum;
    /* Pad sizeof to 128 (multiple of 64) so slots never share a line. */
    char _pad[108];
} Slot;

typedef struct {
    Input in;
    Slot *slots;
    int workerCount;
    int itemsPerWorker;
    int roundsPerItem;
    uint32_t *bases;
    uint32_t *muls;
    Barrier dispatch;
    Barrier complete;
    volatile int shouldStop;
} BwCtx;

static inline uint32_t mix32(uint32_t x) {
    x ^= x >> 16; x *= 0x21f0aaad;
    x ^= x >> 15; x *= 0x735a2d97;
    x ^= x >> 15;
    return x;
}

static inline uint64_t rotateLeft64(uint64_t x, unsigned n) {
    return (x << n) | (x >> (64 - n));
}

static uint32_t parseHexSeed(const char *s) {
    return (uint32_t)strtoul(s, NULL, 16);
}

static char *readFile(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) { fprintf(stderr, "Failed to open: %s\n", path); exit(1); }
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    char *buf = malloc(sz + 1);
    fread(buf, 1, sz, f);
    buf[sz] = '\0';
    fclose(f);
    return buf;
}

static char *read_stdin_line(char *buf, size_t cap) {
    if (!fgets(buf, (int)cap, stdin)) return NULL;
    size_t len = strlen(buf);
    while (len > 0 && (buf[len - 1] == '\n' || buf[len - 1] == '\r')) buf[--len] = '\0';
    return buf;
}

static const char *protocol_field(const char *line, const char *field, char *out, size_t out_cap) {
    char key[64];
    snprintf(key, sizeof(key), "\"%s\":", field);
    const char *start = strstr(line, key);
    if (!start) return NULL;
    start += strlen(key);
    while (*start == ' ') start++;
    if (*start == '"') {
        start++;
        const char *end = strchr(start, '"');
        if (!end) return NULL;
        size_t len = (size_t)(end - start);
        if (len >= out_cap) len = out_cap - 1;
        memcpy(out, start, len);
        out[len] = '\0';
        return out;
    }
    size_t i = 0;
    while (start[i] && strchr(",} ", start[i]) == NULL && i + 1 < out_cap) {
        out[i] = start[i];
        i++;
    }
    out[i] = '\0';
    return out;
}

static void emit_line(const char *json) {
    fputs(json, stdout);
    fputc('\n', stdout);
    fflush(stdout);
}

static void digest_hex_bytes(const uint8_t *data, size_t len, char out[65]) {
    SHA256 sha;
    sha256_init(&sha);
    sha256_update(&sha, data, len);
    sha256_hex(&sha, out);
}

#define XROUND(x) do { \
    x ^= x << 13;      \
    x ^= x >> 17;      \
    x ^= x << 5;       \
    x = x * 0x9e3779b1u + 0x85ebca77u; \
} while (0)

/* Worker entry with explicit id (created via thread_start wrapper). */
typedef struct { BwCtx *ctx; int id; } ThreadArg;

static void *thread_start(void *arg) {
    ThreadArg *ta = (ThreadArg *)arg;
    BwCtx *c = ta->ctx;
    int id = ta->id;
    free(ta);

    const int items = c->itemsPerWorker;
    const int rounds = c->roundsPerItem;
    const uint32_t base = c->bases[id];
    const uint32_t workerMul = c->muls[id];
    Slot *slot = &c->slots[id];

    const int n4 = items & ~3;
    while (1) {
        barrier_wait(&c->dispatch);
        if (c->shouldStop) break;
        uint32_t phaseSeed = slot->seed;

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
        slot->localXor = xor0 ^ xor1 ^ xor2 ^ xor3 ^ xorT;
        slot->localSum = sum0 + sum1 + sum2 + sum3 + sumT;

        barrier_wait(&c->complete);
    }
    /* Coordinator is waiting in complete after the stop dispatch. */
    barrier_wait(&c->complete);
    return NULL;
}

static char *produce_output(void *ctx, size_t *out_len) {
    BwCtx *c = (BwCtx *)ctx;
    Input *in = &c->in;
    int workerCount = c->workerCount;

    uint32_t phaseSeed = in->initialSeed;
    uint64_t digest = 0x6a09e667f3bcc909ULL;

    for (int phase = 0; phase < in->phaseCount; phase++) {
        for (int w = 0; w < workerCount; w++)
            c->slots[w].seed = phaseSeed;
        barrier_wait(&c->dispatch);
        barrier_wait(&c->complete);

        uint32_t nextSeed = phaseSeed ^ (uint32_t)phase;
        uint64_t phaseSum = 0;
        for (int w = 0; w < workerCount; w++) {
            nextSeed = mix32(nextSeed ^ c->slots[w].localXor
                ^ (uint32_t)c->slots[w].localSum
                ^ (uint32_t)(c->slots[w].localSum >> 32)
                ^ (uint32_t)w);
            phaseSum += c->slots[w].localSum;
        }
        phaseSeed = nextSeed;
        digest = rotateLeft64(digest, 7);
        digest ^= (uint64_t)phaseSeed;
        digest += phaseSum;
    }

    char finalSeed[9], digestStr[17];
    snprintf(finalSeed, sizeof(finalSeed), "%08x", phaseSeed);
    snprintf(digestStr, sizeof(digestStr), "%016llx", (unsigned long long)digest);

    JsonValue out = json_object();
    json_object_set(&out, "schemaVersion", json_string("1.0.0"));
    json_object_set(&out, "benchmark", json_string("barrier-wave"));
    json_object_set(&out, "workerCount", json_number(in->workerCount));
    json_object_set(&out, "phaseCount", json_number(in->phaseCount));
    json_object_set(&out, "itemsProcessed", json_number((double)in->workerCount * in->phaseCount * in->itemsPerWorker));
    json_object_set(&out, "finalSeed", json_string(finalSeed));
    json_object_set(&out, "digest", json_string(digestStr));
    char *dumped = json_dump(&out);
    json_free(&out);
    *out_len = strlen(dumped);
    return dumped;
}

int main(int argc, char *argv[]) {
    char *inputPath = NULL, *outputPath = NULL;
    int protocol_ok = 0;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--input") == 0 && i + 1 < argc) inputPath = argv[++i];
        else if (strcmp(argv[i], "--output") == 0 && i + 1 < argc) outputPath = argv[++i];
        else if (strcmp(argv[i], "--protocol-version") == 0 && i + 1 < argc)
            protocol_ok = strcmp(argv[++i], PROTOCOL_VERSION) == 0;
    }
    if (!inputPath || !outputPath || !protocol_ok) {
        fprintf(stderr, "missing required arguments\n");
        return 1;
    }

    char *inputJson = readFile(inputPath);
    JsonValue root = json_parse(inputJson);
    free(inputJson);

    Input in;
    strcpy(in.schemaVersion, json_as_string(json_object_get(&root, "schemaVersion")));
    in.workerCount = json_as_int(json_object_get(&root, "workerCount"));
    in.phaseCount = json_as_int(json_object_get(&root, "phaseCount"));
    in.itemsPerWorker = json_as_int(json_object_get(&root, "itemsPerWorker"));
    in.roundsPerItem = json_as_int(json_object_get(&root, "roundsPerItem"));
    in.initialSeed = parseHexSeed(json_as_string(json_object_get(&root, "initialSeed")));
    json_free(&root);

    BwCtx ctx;
    ctx.in = in;
    ctx.workerCount = in.workerCount;
    ctx.itemsPerWorker = in.itemsPerWorker;
    ctx.roundsPerItem = in.roundsPerItem;
    ctx.slots = calloc(in.workerCount, sizeof(Slot));
    ctx.bases = malloc(in.workerCount * sizeof(uint32_t));
    ctx.muls = malloc(in.workerCount * sizeof(uint32_t));
    ctx.shouldStop = 0;
    barrier_init(&ctx.dispatch, in.workerCount + 1);
    barrier_init(&ctx.complete, in.workerCount + 1);
    for (int i = 0; i < in.workerCount; i++) {
        ctx.slots[i].id = i;
        ctx.bases[i] = (uint32_t)(i * in.itemsPerWorker);
        ctx.muls[i] = (uint32_t)i * 0x9e3779b9u;
    }

    pthread_t *threads = malloc(in.workerCount * sizeof(pthread_t));
    for (int i = 0; i < in.workerCount; i++) {
        ThreadArg *ta = malloc(sizeof(ThreadArg));
        ta->ctx = &ctx;
        ta->id = i;
        pthread_create(&threads[i], NULL, thread_start, ta);
    }

    char line[4096], field[256], digest[65];
    char *lastOutput = NULL;
    size_t lastLen = 0;
    emit_line("{\"type\":\"ready\",\"protocolVersion\":\"" PROTOCOL_VERSION "\"}");
    while (read_stdin_line(line, sizeof(line))) {
        if (!line[0]) continue;
        if (protocol_field(line, "type", field, sizeof(field)) && strcmp(field, "run") == 0) {
            long requestId = atol(protocol_field(line, "requestId", field, sizeof(field)));
            free(lastOutput);
            lastOutput = produce_output(&ctx, &lastLen);
            digest_hex_bytes((const uint8_t *)lastOutput, lastLen, digest);
            printf("{\"type\":\"result\",\"requestId\":%ld,\"digest\":\"%s\"}\n", requestId, digest);
            fflush(stdout);
        } else if (protocol_field(line, "type", field, sizeof(field)) && strcmp(field, "finish") == 0) {
            digest_hex_bytes((const uint8_t *)lastOutput, lastLen, digest);
            FILE *f = fopen(outputPath, "wb");
            fwrite(lastOutput, 1, lastLen, f);
            fclose(f);
            printf("{\"type\":\"finish\",\"digest\":\"%s\"}\n", digest);
            fflush(stdout);
            break;
        }
    }

    ctx.shouldStop = 1;
    barrier_wait(&ctx.dispatch);
    barrier_wait(&ctx.complete);
    for (int i = 0; i < in.workerCount; i++)
        pthread_join(threads[i], NULL);

    barrier_destroy(&ctx.dispatch);
    barrier_destroy(&ctx.complete);
    free(lastOutput);
    free(ctx.slots);
    free(ctx.bases);
    free(ctx.muls);
    free(threads);
    return 0;
}
