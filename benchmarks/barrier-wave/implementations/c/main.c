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

typedef struct {
    int id;
    int itemsPerWorker;
    int roundsPerItem;
    pthread_mutex_t mtx;
    pthread_cond_t cond;
    int hasWork;
    int isDone;
    int shouldStop;
    uint32_t seed;
    uint32_t localXor;
    uint64_t localSum;
    char _pad[64];
} Worker;

typedef struct {
    Input in;
    Worker *workers;
    int workerCount;
} BwCtx;

static uint32_t mix32(uint32_t x) {
    x ^= x >> 16; x *= 0x21f0aaad;
    x ^= x >> 15; x *= 0x735a2d97;
    x ^= x >> 15;
    return x;
}

static uint64_t rotateLeft64(uint64_t x, unsigned n) {
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

static void *workerFn(void *arg) {
    Worker *w = (Worker *)arg;
    while (1) {
        pthread_mutex_lock(&w->mtx);
        while (!w->hasWork && !w->shouldStop)
            pthread_cond_wait(&w->cond, &w->mtx);
        if (w->shouldStop) { pthread_mutex_unlock(&w->mtx); break; }
        uint32_t phaseSeed = w->seed;
        w->hasWork = 0;
        pthread_mutex_unlock(&w->mtx);

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

        pthread_mutex_lock(&w->mtx);
        w->localXor = localXor;
        w->localSum = localSum;
        w->isDone = 1;
        pthread_cond_signal(&w->cond);
        pthread_mutex_unlock(&w->mtx);
    }
    return NULL;
}

static char *produce_output(void *ctx, size_t *out_len) {
    BwCtx *c = (BwCtx *)ctx;
    Input *in = &c->in;
    Worker *workers = c->workers;
    int workerCount = c->workerCount;

    uint32_t phaseSeed = in->initialSeed;
    uint64_t digest = 0x6a09e667f3bcc909ULL;

    for (int phase = 0; phase < in->phaseCount; phase++) {
        for (int w = 0; w < workerCount; w++) {
            pthread_mutex_lock(&workers[w].mtx);
            workers[w].seed = phaseSeed;
            workers[w].hasWork = 1;
            workers[w].isDone = 0;
            pthread_cond_signal(&workers[w].cond);
            pthread_mutex_unlock(&workers[w].mtx);
        }

        for (int w = 0; w < workerCount; w++) {
            pthread_mutex_lock(&workers[w].mtx);
            while (!workers[w].isDone)
                pthread_cond_wait(&workers[w].cond, &workers[w].mtx);
            pthread_mutex_unlock(&workers[w].mtx);
        }

        uint32_t nextSeed = phaseSeed ^ (uint32_t)phase;
        uint64_t phaseSum = 0;
        for (int w = 0; w < workerCount; w++) {
            nextSeed = mix32(nextSeed ^ workers[w].localXor
                ^ (uint32_t)workers[w].localSum
                ^ (uint32_t)(workers[w].localSum >> 32)
                ^ (uint32_t)w);
            phaseSum += workers[w].localSum;
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

    Worker *workers = calloc(in.workerCount, sizeof(Worker));
    pthread_t *threads = malloc(in.workerCount * sizeof(pthread_t));

    for (int i = 0; i < in.workerCount; i++) {
        workers[i].id = i;
        workers[i].itemsPerWorker = in.itemsPerWorker;
        workers[i].roundsPerItem = in.roundsPerItem;
        pthread_mutex_init(&workers[i].mtx, NULL);
        pthread_cond_init(&workers[i].cond, NULL);
        pthread_create(&threads[i], NULL, workerFn, &workers[i]);
    }

    BwCtx ctx = { .in = in, .workers = workers, .workerCount = in.workerCount };

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

    for (int i = 0; i < in.workerCount; i++) {
        pthread_mutex_lock(&workers[i].mtx);
        workers[i].shouldStop = 1;
        pthread_cond_signal(&workers[i].cond);
        pthread_mutex_unlock(&workers[i].mtx);
        pthread_join(threads[i], NULL);
        pthread_mutex_destroy(&workers[i].mtx);
        pthread_cond_destroy(&workers[i].cond);
    }

    free(lastOutput);
    free(workers);
    free(threads);
    return 0;
}
