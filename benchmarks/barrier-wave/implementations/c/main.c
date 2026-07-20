#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <time.h>
#include <pthread.h>
#include "json.h"

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
    int iteration;
    int64_t kernelTimeNanoseconds;
} Sample;

static double T_CRITICAL[30] = {0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045};

static double ciWidth(int64_t *samples, int n) {
    if (n < 2) return 1e308;
    double mean = 0;
    for (int i = 0; i < n; i++) mean += (double)samples[i];
    mean /= n;
    if (mean <= 0) return 1e308;
    double variance = 0;
    for (int i = 0; i < n; i++) {
        double delta = (double)samples[i] - mean;
        variance += delta * delta;
    }
    variance /= (n - 1);
    double t = n < 30 ? T_CRITICAL[n] : 2.0;
    return (2.0 * t * sqrt(variance / n)) / mean;
}

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

int main(int argc, char *argv[]) {
    char *inputPath = NULL, *outputPath = NULL, *timingPath = NULL;
    int warmup = 0, minIter = 1, maxIter = 1;
    double targetCi = 0.05;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--input") == 0 && i+1 < argc) inputPath = argv[++i];
        else if (strcmp(argv[i], "--output") == 0 && i+1 < argc) outputPath = argv[++i];
        else if (strcmp(argv[i], "--timing-output") == 0 && i+1 < argc) timingPath = argv[++i];
        else if (strcmp(argv[i], "--warmup") == 0 && i+1 < argc) warmup = atoi(argv[++i]);
        else if (strcmp(argv[i], "--min-iterations") == 0 && i+1 < argc) minIter = atoi(argv[++i]);
        else if (strcmp(argv[i], "--max-iterations") == 0 && i+1 < argc) maxIter = atoi(argv[++i]);
        else if (strcmp(argv[i], "--target-relative-ci") == 0 && i+1 < argc) targetCi = atof(argv[++i]);
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

    Sample samples[1024];
    int sampleCount = 0;
    int64_t kernelTimes[1024];
    int ktCount = 0;
    uint32_t finalPhaseSeed = 0;
    uint64_t finalDigest = 0;

    for (int iter = -warmup; ; iter++) {
        uint32_t phaseSeed = in.initialSeed;
        uint64_t digest = 0x6a09e667f3bcc909ULL;

        struct timespec t1, t2;
        clock_gettime(CLOCK_MONOTONIC, &t1);

        for (int phase = 0; phase < in.phaseCount; phase++) {
            for (int w = 0; w < in.workerCount; w++) {
                pthread_mutex_lock(&workers[w].mtx);
                workers[w].seed = phaseSeed;
                workers[w].hasWork = 1;
                workers[w].isDone = 0;
                pthread_cond_signal(&workers[w].cond);
                pthread_mutex_unlock(&workers[w].mtx);
            }

            for (int w = 0; w < in.workerCount; w++) {
                pthread_mutex_lock(&workers[w].mtx);
                while (!workers[w].isDone)
                    pthread_cond_wait(&workers[w].cond, &workers[w].mtx);
                pthread_mutex_unlock(&workers[w].mtx);
            }

            uint32_t nextSeed = phaseSeed ^ (uint32_t)phase;
            uint64_t phaseSum = 0;
            for (int w = 0; w < in.workerCount; w++) {
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

        clock_gettime(CLOCK_MONOTONIC, &t2);
        int64_t elapsed = (int64_t)(t2.tv_sec - t1.tv_sec) * 1000000000LL + (t2.tv_nsec - t1.tv_nsec);
        if (elapsed < 1) elapsed = 1;

        if (iter >= 0) {
            kernelTimes[ktCount++] = elapsed;
            samples[sampleCount].iteration = sampleCount + 1;
            samples[sampleCount].kernelTimeNanoseconds = elapsed;
            sampleCount++;
            if (ktCount >= maxIter || (ktCount >= minIter && ciWidth(kernelTimes, ktCount) <= targetCi)) {
                finalPhaseSeed = phaseSeed;
                finalDigest = digest;
                break;
            }
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

    {
        char finalSeed[9], digestStr[17];
        snprintf(finalSeed, sizeof(finalSeed), "%08x", finalPhaseSeed);
        snprintf(digestStr, sizeof(digestStr), "%016llx", (unsigned long long)finalDigest);

        JsonValue out = json_object();
        json_object_set(&out, "schemaVersion", json_string("1.0.0"));
        json_object_set(&out, "benchmark", json_string("barrier-wave"));
        json_object_set(&out, "workerCount", json_number(in.workerCount));
        json_object_set(&out, "phaseCount", json_number(in.phaseCount));
        json_object_set(&out, "itemsProcessed", json_number((double)in.workerCount * in.phaseCount * in.itemsPerWorker));
        json_object_set(&out, "finalSeed", json_string(finalSeed));
        json_object_set(&out, "digest", json_string(digestStr));
        char *dumped = json_dump(&out);
        FILE *f = fopen(outputPath, "wb");
        fwrite(dumped, 1, strlen(dumped), f);
        fclose(f);
        free(dumped);
        json_free(&out);
    }

    {
        JsonValue timing = json_object();
        JsonValue arr = json_array();
        for (int i = 0; i < sampleCount; i++) {
            JsonValue s = json_object();
            json_object_set(&s, "iteration", json_number(samples[i].iteration));
            json_object_set(&s, "kernelTimeNanoseconds", json_number(samples[i].kernelTimeNanoseconds));
            json_array_push(&arr, s);
        }
        json_object_set(&timing, "samples", arr);
        char *dumped = json_dump(&timing);
        FILE *f = fopen(timingPath, "wb");
        fwrite(dumped, 1, strlen(dumped), f);
        fclose(f);
        free(dumped);
        json_free(&timing);
    }

    free(workers);
    free(threads);
    return 0;
}
