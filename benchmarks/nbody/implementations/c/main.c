#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdint.h>
#include "json.h"
#include "sha256.h"

#define PROTOCOL_VERSION "2.0.0"

typedef struct {
    double mass;
    double position[3];
    double velocity[3];
} Body;

typedef struct {
    int steps;
    double deltaTime;
    Body *initialBodies;
    Body *bodiesCopy;
    int bodyCount;
} NbodyCtx;

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

static void kernel(const NbodyCtx *ctx, Body *bodies, double *outEnergy,
                   char *outPosChecksum, char *outVelChecksum) {
    int n = ctx->bodyCount;
    double dt = ctx->deltaTime;

    for (int s = 0; s < ctx->steps; s++) {
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

static char *produce_output(void *ctx, size_t *out_len) {
    NbodyCtx *c = (NbodyCtx *)ctx;
    memcpy(c->bodiesCopy, c->initialBodies, c->bodyCount * sizeof(Body));

    double finalEnergy;
    char posChecksum[65], velChecksum[65];
    kernel(c, c->bodiesCopy, &finalEnergy, posChecksum, velChecksum);

    JsonValue out = json_object();
    json_object_set(&out, "benchmark", json_string("nbody"));
    json_object_set(&out, "version", json_number(1));
    json_object_set(&out, "bodyCount", json_number(c->bodyCount));
    json_object_set(&out, "finalEnergy", json_number(finalEnergy));
    json_object_set(&out, "positionChecksum", json_string(posChecksum));
    json_object_set(&out, "velocityChecksum", json_string(velChecksum));
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

    NbodyCtx ctx = {0};
    ctx.steps = json_as_int(json_object_get(&root, "steps"));
    ctx.deltaTime = json_as_double(json_object_get(&root, "deltaTime"));
    JsonValue *bodiesArr = json_object_get(&root, "bodies");
    ctx.bodyCount = (int)bodiesArr->as.array.count;
    ctx.initialBodies = malloc(ctx.bodyCount * sizeof(Body));
    for (int i = 0; i < ctx.bodyCount; i++) {
        JsonValue *b = json_array_get(bodiesArr, i);
        ctx.initialBodies[i].mass = json_as_double(json_object_get(b, "mass"));
        JsonValue *pos = json_object_get(b, "position");
        JsonValue *vel = json_object_get(b, "velocity");
        for (int k = 0; k < 3; k++) {
            ctx.initialBodies[i].position[k] = json_as_double(json_array_get(pos, k));
            ctx.initialBodies[i].velocity[k] = json_as_double(json_array_get(vel, k));
        }
    }
    json_free(&root);
    ctx.bodiesCopy = malloc(ctx.bodyCount * sizeof(Body));

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

    free(lastOutput);
    free(ctx.bodiesCopy);
    free(ctx.initialBodies);
    return 0;
}
