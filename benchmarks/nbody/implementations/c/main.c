#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdint.h>
#include "json.h"
#include "sha256.h"

#define PROTOCOL_VERSION "2.0.0"

typedef struct {
    int steps;
    double deltaTime;
    int bodyCount;
    double *mass;
    double *ipx, *ipy, *ipz;
    double *ivx, *ivy, *ivz;
    double *px, *py, *pz;
    double *vx, *vy, *vz;
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

static void kernel(NbodyCtx *ctx, double *outEnergy,
                   char *outPosChecksum, char *outVelChecksum) {
    const int n = ctx->bodyCount;
    const double dt = ctx->deltaTime;
    const int steps = ctx->steps;
    const double *__restrict mass = ctx->mass;
    double *__restrict px = ctx->px, *__restrict py = ctx->py, *__restrict pz = ctx->pz;
    double *__restrict vx = ctx->vx, *__restrict vy = ctx->vy, *__restrict vz = ctx->vz;
    memcpy(px, ctx->ipx, (size_t)n * sizeof(double));
    memcpy(py, ctx->ipy, (size_t)n * sizeof(double));
    memcpy(pz, ctx->ipz, (size_t)n * sizeof(double));
    memcpy(vx, ctx->ivx, (size_t)n * sizeof(double));
    memcpy(vy, ctx->ivy, (size_t)n * sizeof(double));
    memcpy(vz, ctx->ivz, (size_t)n * sizeof(double));

    for (int s = 0; s < steps; s++) {
        for (int i = 0; i < n; i++) {
            const double pxi = px[i], pyi = py[i], pzi = pz[i];
            const double mi = mass[i];
            double vxi = vx[i], vyi = vy[i], vzi = vz[i];
            for (int j = i + 1; j < n; j++) {
                const double dx = px[j] - pxi;
                const double dy = py[j] - pyi;
                const double dz = pz[j] - pzi;
                const double r2 = dx * dx + dy * dy + dz * dz;
                const double mag = dt / (r2 * sqrt(r2));
                const double mj = mass[j];
                vxi += dx * mj * mag;
                vyi += dy * mj * mag;
                vzi += dz * mj * mag;
                vx[j] -= dx * mi * mag;
                vy[j] -= dy * mi * mag;
                vz[j] -= dz * mi * mag;
            }
            vx[i] = vxi;
            vy[i] = vyi;
            vz[i] = vzi;
        }
        for (int i = 0; i < n; i++) {
            px[i] += dt * vx[i];
            py[i] += dt * vy[i];
            pz[i] += dt * vz[i];
        }
    }

    double energy = 0;
    for (int i = 0; i < n; i++) {
        const double vxi = vx[i], vyi = vy[i], vzi = vz[i];
        energy += 0.5 * mass[i] * (vxi * vxi + vyi * vyi + vzi * vzi);
        const double pxi = px[i], pyi = py[i], pzi = pz[i];
        const double mi = mass[i];
        for (int j = i + 1; j < n; j++) {
            const double dx = pxi - px[j];
            const double dy = pyi - py[j];
            const double dz = pzi - pz[j];
            energy -= mi * mass[j] / sqrt(dx * dx + dy * dy + dz * dz);
        }
    }
    *outEnergy = energy;

    char posData[8192] = {0}, velData[8192] = {0};
    int posLen = 0, velLen = 0;
    for (int i = 0; i < n; i++) {
        posLen += snprintf(posData + posLen, sizeof(posData) - posLen, "%.9f,", px[i]);
        posLen += snprintf(posData + posLen, sizeof(posData) - posLen, "%.9f,", py[i]);
        posLen += snprintf(posData + posLen, sizeof(posData) - posLen, "%.9f,", pz[i]);
        velLen += snprintf(velData + velLen, sizeof(velData) - velLen, "%.9f,", vx[i]);
        velLen += snprintf(velData + velLen, sizeof(velData) - velLen, "%.9f,", vy[i]);
        velLen += snprintf(velData + velLen, sizeof(velData) - velLen, "%.9f,", vz[i]);
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

    double finalEnergy;
    char posChecksum[65], velChecksum[65];
    kernel(c, &finalEnergy, posChecksum, velChecksum);

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
    int nb = ctx.bodyCount;
    ctx.mass = malloc((size_t)nb * sizeof(double));
    ctx.ipx = malloc((size_t)nb * sizeof(double));
    ctx.ipy = malloc((size_t)nb * sizeof(double));
    ctx.ipz = malloc((size_t)nb * sizeof(double));
    ctx.ivx = malloc((size_t)nb * sizeof(double));
    ctx.ivy = malloc((size_t)nb * sizeof(double));
    ctx.ivz = malloc((size_t)nb * sizeof(double));
    ctx.px = malloc((size_t)nb * sizeof(double));
    ctx.py = malloc((size_t)nb * sizeof(double));
    ctx.pz = malloc((size_t)nb * sizeof(double));
    ctx.vx = malloc((size_t)nb * sizeof(double));
    ctx.vy = malloc((size_t)nb * sizeof(double));
    ctx.vz = malloc((size_t)nb * sizeof(double));
    for (int i = 0; i < ctx.bodyCount; i++) {
        JsonValue *b = json_array_get(bodiesArr, i);
        ctx.mass[i] = json_as_double(json_object_get(b, "mass"));
        JsonValue *pos = json_object_get(b, "position");
        JsonValue *vel = json_object_get(b, "velocity");
        ctx.ipx[i] = json_as_double(json_array_get(pos, 0));
        ctx.ipy[i] = json_as_double(json_array_get(pos, 1));
        ctx.ipz[i] = json_as_double(json_array_get(pos, 2));
        ctx.ivx[i] = json_as_double(json_array_get(vel, 0));
        ctx.ivy[i] = json_as_double(json_array_get(vel, 1));
        ctx.ivz[i] = json_as_double(json_array_get(vel, 2));
    }
    json_free(&root);

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
    free(ctx.mass);
    free(ctx.ipx); free(ctx.ipy); free(ctx.ipz);
    free(ctx.ivx); free(ctx.ivy); free(ctx.ivz);
    free(ctx.px); free(ctx.py); free(ctx.pz);
    free(ctx.vx); free(ctx.vy); free(ctx.vz);
    return 0;
}
