#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdint.h>
#include <time.h>
#include "json.h"
#include "sha256.h"

typedef struct {
    double mass;
    double position[3];
    double velocity[3];
} Body;

typedef struct {
    int steps;
    double deltaTime;
    Body *bodies;
    int bodyCount;
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
    in.steps = json_as_int(json_object_get(&root, "steps"));
    in.deltaTime = json_as_double(json_object_get(&root, "deltaTime"));
    JsonValue *bodiesArr = json_object_get(&root, "bodies");
    in.bodyCount = (int)bodiesArr->as.array.count;
    in.bodies = malloc(in.bodyCount * sizeof(Body));
    for (int i = 0; i < in.bodyCount; i++) {
        JsonValue *b = json_array_get(bodiesArr, i);
        in.bodies[i].mass = json_as_double(json_object_get(b, "mass"));
        JsonValue *pos = json_object_get(b, "position");
        JsonValue *vel = json_object_get(b, "velocity");
        for (int k = 0; k < 3; k++) {
            in.bodies[i].position[k] = json_as_double(json_array_get(pos, k));
            in.bodies[i].velocity[k] = json_as_double(json_array_get(vel, k));
        }
    }
    json_free(&root);
    return in;
}

static void kernel(const Input *in, Body *bodies, double *outEnergy,
                   char *outPosChecksum, char *outVelChecksum) {
    int n = in->bodyCount;
    double dt = in->deltaTime;

    for (int s = 0; s < in->steps; s++) {
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                double d[3], r2 = 0;
                for (int k = 0; k < 3; k++) {
                    d[k] = bodies[j].position[k] - bodies[i].position[k];
                    r2 += d[k] * d[k];
                }
                double mag = dt / (r2 * sqrt(r2));
                for (int k = 0; k < 3; k++) {
                    bodies[i].velocity[k] += d[k] * bodies[j].mass * mag;
                    bodies[j].velocity[k] -= d[k] * bodies[i].mass * mag;
                }
            }
        }
        for (int i = 0; i < n; i++)
            for (int k = 0; k < 3; k++)
                bodies[i].position[k] += dt * bodies[i].velocity[k];
    }

    double energy = 0;
    for (int i = 0; i < n; i++) {
        double v2 = 0;
        for (int k = 0; k < 3; k++) v2 += bodies[i].velocity[k] * bodies[i].velocity[k];
        energy += 0.5 * bodies[i].mass * v2;
        for (int j = i + 1; j < n; j++) {
            double r2 = 0;
            for (int k = 0; k < 3; k++) {
                double diff = bodies[i].position[k] - bodies[j].position[k];
                r2 += diff * diff;
            }
            energy -= bodies[i].mass * bodies[j].mass / sqrt(r2);
        }
    }
    *outEnergy = energy;

    char posData[4096] = {0}, velData[4096] = {0};
    int posLen = 0, velLen = 0;
    for (int i = 0; i < n; i++) {
        for (int k = 0; k < 3; k++) {
            posLen += snprintf(posData + posLen, sizeof(posData) - posLen, "%.9f,", bodies[i].position[k]);
            velLen += snprintf(velData + velLen, sizeof(velData) - velLen, "%.9f,", bodies[i].velocity[k]);
        }
    }

    SHA256 ph, vh;
    sha256_init(&ph);
    sha256_init(&vh);
    sha256_update(&ph, (uint8_t *)posData, posLen);
    sha256_update(&vh, (uint8_t *)velData, velLen);
    sha256_hex(&ph, outPosChecksum);
    sha256_hex(&vh, outVelChecksum);
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

    Sample samples[1024];
    int sampleCount = 0;
    int64_t kernelTimes[1024];
    int ktCount = 0;

    double finalEnergy;
    char posChecksum[65], velChecksum[65];

    Body *bodiesCopy = malloc(in.bodyCount * sizeof(Body));

    for (int i = -warmup; ; i++) {
        memcpy(bodiesCopy, in.bodies, in.bodyCount * sizeof(Body));

        struct timespec t1, t2;
        clock_gettime(CLOCK_MONOTONIC, &t1);
        kernel(&in, bodiesCopy, &finalEnergy, posChecksum, velChecksum);
        clock_gettime(CLOCK_MONOTONIC, &t2);

        int64_t elapsed = (int64_t)(t2.tv_sec - t1.tv_sec) * 1000000000LL + (t2.tv_nsec - t1.tv_nsec);
        if (elapsed < 1) elapsed = 1;

        if (i >= 0) {
            kernelTimes[ktCount++] = elapsed;
            samples[sampleCount].iteration = sampleCount + 1;
            samples[sampleCount].kernelTimeNanoseconds = elapsed;
            sampleCount++;
            if (ktCount >= maxIter || (ktCount >= minIter && ciWidth(kernelTimes, ktCount) <= targetCi))
                break;
        }
    }

    /* Write output JSON */
    {
        JsonValue out = json_object();
        json_object_set(&out, "benchmark", json_string("nbody"));
        json_object_set(&out, "version", json_number(1));
        json_object_set(&out, "bodyCount", json_number(in.bodyCount));
        json_object_set(&out, "finalEnergy", json_number(finalEnergy));
        json_object_set(&out, "positionChecksum", json_string(posChecksum));
        json_object_set(&out, "velocityChecksum", json_string(velChecksum));
        char *dumped = json_dump(&out);
        FILE *f = fopen(outputPath, "wb");
        fwrite(dumped, 1, strlen(dumped), f);
        fclose(f);
        free(dumped);
        json_free(&out);
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

    free(bodiesCopy);
    free(in.bodies);
    return 0;
}
