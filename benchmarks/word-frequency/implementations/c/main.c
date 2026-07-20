#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <time.h>
#include "json.h"
#include "sha256.h"

typedef struct {
    char word[256];
    int count;
} Entry;

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

static int entryCmp(const void *a, const void *b) {
    const Entry *ea = a, *eb = b;
    if (ea->count != eb->count) return eb->count - ea->count;
    return strcmp(ea->word, eb->word);
}

/* Simple hash map for word counting */
#define MAP_CAP 65536
typedef struct { char word[256]; int count; } MapEntry;

static uint32_t hashStr(const char *s) {
    uint32_t h = 2166136261u;
    while (*s) { h ^= (uint8_t)*s++; h *= 16777619u; }
    return h;
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
    JsonValue *wordsArr = json_object_get(&root, "words");
    int totalWords = (int)wordsArr->as.array.count;
    char **words = malloc(totalWords * sizeof(char*));
    for (int i = 0; i < totalWords; i++)
        words[i] = strdup(json_as_string(json_array_get(wordsArr, i)));
    json_free(&root);

    Sample samples[1024];
    int sampleCount = 0;
    int64_t kernelTimes[1024];
    int ktCount = 0;

    for (int iter = -warmup; ; iter++) {
        MapEntry *map = calloc(MAP_CAP, sizeof(MapEntry));
        int mapUsed = 0;

        struct timespec t1, t2;
        clock_gettime(CLOCK_MONOTONIC, &t1);

        /* Count words */
        for (int i = 0; i < totalWords; i++) {
            uint32_t h = hashStr(words[i]);
            int idx = h % MAP_CAP;
            while (map[idx].word[0] != '\0' && strcmp(map[idx].word, words[i]) != 0)
                idx = (idx + 1) % MAP_CAP;
            if (map[idx].word[0] == '\0') {
                strcpy(map[idx].word, words[i]);
                mapUsed++;
            }
            map[idx].count++;
        }

        /* Collect into array and sort */
        Entry *entries = malloc(mapUsed * sizeof(Entry));
        int eIdx = 0;
        for (int i = 0; i < MAP_CAP; i++) {
            if (map[i].word[0] != '\0') {
                strcpy(entries[eIdx].word, map[i].word);
                entries[eIdx].count = map[i].count;
                eIdx++;
            }
        }
        qsort(entries, mapUsed, sizeof(Entry), entryCmp);

        /* Compute checksum */
        SHA256 hasher;
        sha256_init(&hasher);
        for (int i = 0; i < mapUsed; i++) {
            char line[320];
            int len = snprintf(line, sizeof(line), "%s,%d\n", entries[i].word, entries[i].count);
            sha256_update(&hasher, (uint8_t *)line, len);
        }
        char checksumHex[65];
        sha256_hex(&hasher, checksumHex);

        int topCount = mapUsed < 10 ? mapUsed : 10;

        clock_gettime(CLOCK_MONOTONIC, &t2);
        int64_t elapsed = (int64_t)(t2.tv_sec - t1.tv_sec) * 1000000000LL + (t2.tv_nsec - t1.tv_nsec);
        if (elapsed < 1) elapsed = 1;

        free(map);

        if (iter >= 0) {
            kernelTimes[ktCount++] = elapsed;
            samples[sampleCount].iteration = sampleCount + 1;
            samples[sampleCount].kernelTimeNanoseconds = elapsed;
            sampleCount++;

            if (ktCount >= maxIter || (ktCount >= minIter && ciWidth(kernelTimes, ktCount) <= targetCi)) {
                /* Write output JSON */
                JsonValue out = json_object();
                json_object_set(&out, "benchmark", json_string("word-frequency"));
                json_object_set(&out, "version", json_number(1));
                json_object_set(&out, "totalWords", json_number(totalWords));
                json_object_set(&out, "uniqueWords", json_number(mapUsed));
                JsonValue topArr = json_array();
                for (int i = 0; i < topCount; i++) {
                    JsonValue e = json_object();
                    json_object_set(&e, "word", json_string(entries[i].word));
                    json_object_set(&e, "count", json_number(entries[i].count));
                    json_array_push(&topArr, e);
                }
                json_object_set(&out, "topWords", topArr);
                json_object_set(&out, "checksum", json_string(checksumHex));
                char *dumped = json_dump(&out);
                FILE *f = fopen(outputPath, "wb");
                fwrite(dumped, 1, strlen(dumped), f);
                fclose(f);
                free(dumped);
                json_free(&out);
                free(entries);
                break;
            }
        }
        free(entries);
    }

    /* Write timing JSON */
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

    for (int i = 0; i < totalWords; i++) free(words[i]);
    free(words);
    return 0;
}
