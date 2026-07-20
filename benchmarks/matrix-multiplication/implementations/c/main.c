#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <time.h>
#include "json.h"
#include "sha256.h"

typedef struct {
    int dimension;
    int64_t *left;
    int64_t *right;
} Input;

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

static Input parseInput(const char *jsonStr) {
    Input in = {0};
    JsonValue root = json_parse(jsonStr);
    in.dimension = json_as_int(json_object_get(&root, "dimension"));
    int n = in.dimension;
    JsonValue *leftArr = json_object_get(&root, "left");
    JsonValue *rightArr = json_object_get(&root, "right");
    in.left = malloc(n * n * sizeof(int64_t));
    in.right = malloc(n * n * sizeof(int64_t));
    for (int i = 0; i < n * n; i++) {
        in.left[i] = json_as_int64(json_array_get(leftArr, i));
        in.right[i] = json_as_int64(json_array_get(rightArr, i));
    }
    json_free(&root);
    return in;
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
    Input in = parseInput(inputJson);
    free(inputJson);
    int n = in.dimension;
    int nn = n * n;

    Sample samples[1024];
    int sampleCount = 0;
    int64_t kernelTimes[1024];
    int ktCount = 0;

    for (int iter = -warmup; ; iter++) {
        int64_t *c = malloc(nn * sizeof(int64_t));
        int64_t valueSum = 0, diagonalSum = 0;

        struct timespec t1, t2;
        clock_gettime(CLOCK_MONOTONIC, &t1);

        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                int64_t sum = 0;
                for (int k = 0; k < n; k++) {
                    sum += in.left[i * n + k] * in.right[k * n + j];
                }
                c[i * n + j] = sum;
                valueSum += sum;
                if (i == j) diagonalSum += sum;
            }
        }

        /* Build checksum string */
        int bufCap = nn * 20 + 256;
        char *buf = malloc(bufCap);
        int bufLen = snprintf(buf, bufCap, "dimension=%d\n", n);
        for (int i = 0; i < nn; i++) {
            bufLen += snprintf(buf + bufLen, bufCap - bufLen, "%lld,", (long long)c[i]);
        }
        bufLen += snprintf(buf + bufLen, bufCap - bufLen, "\n");

        SHA256 hasher;
        sha256_init(&hasher);
        sha256_update(&hasher, (uint8_t *)buf, bufLen);
        char checksumHex[65];
        sha256_hex(&hasher, checksumHex);
        free(buf);

        clock_gettime(CLOCK_MONOTONIC, &t2);
        int64_t elapsed = (int64_t)(t2.tv_sec - t1.tv_sec) * 1000000000LL + (t2.tv_nsec - t1.tv_nsec);
        if (elapsed < 1) elapsed = 1;

        free(c);

        if (iter >= 0) {
            kernelTimes[ktCount++] = elapsed;
            samples[sampleCount].iteration = sampleCount + 1;
            samples[sampleCount].kernelTimeNanoseconds = elapsed;
            sampleCount++;

            if (ktCount >= maxIter || (ktCount >= minIter && ciWidth(kernelTimes, ktCount) <= targetCi)) {
                /* Write output JSON */
                JsonValue out = json_object();
                json_object_set(&out, "benchmark", json_string("matrix-multiplication"));
                json_object_set(&out, "version", json_number(1));
                json_object_set(&out, "dimension", json_number(n));
                json_object_set(&out, "elementCount", json_number(nn));
                json_object_set(&out, "valueSum", json_number(valueSum));
                json_object_set(&out, "diagonalSum", json_number(diagonalSum));
                json_object_set(&out, "checksum", json_string(checksumHex));
                char *dumped = json_dump(&out);
                FILE *f = fopen(outputPath, "wb");
                fwrite(dumped, 1, strlen(dumped), f);
                fclose(f);
                free(dumped);
                json_free(&out);
                break;
            }
        }
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

    free(in.left);
    free(in.right);
    return 0;
}
