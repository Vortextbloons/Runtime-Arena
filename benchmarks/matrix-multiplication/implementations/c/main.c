#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include "json.h"
#include "sha256.h"

#define PROTOCOL_VERSION "2.0.0"

typedef struct {
    int dimension;
    int64_t *left;
    int64_t *right;
    int64_t *product;
    char *buf;
    int bufCap;
} MmCtx;

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

static char *produce_output(void *ctx, size_t *out_len) {
    MmCtx *c = (MmCtx *)ctx;
    int n = c->dimension;
    int nn = n * n;
    int64_t *product = c->product;
    char *buf = c->buf;
    int bufCap = c->bufCap;

    int64_t valueSum = 0, diagonalSum = 0;

    memset(product, 0, nn * sizeof(int64_t));
    for (int i = 0; i < n; i++) {
        for (int k = 0; k < n; k++) {
            int64_t aik = c->left[i * n + k];
            for (int j = 0; j < n; j++) {
                product[i * n + j] += aik * c->right[k * n + j];
            }
        }
    }

    for (int i = 0; i < nn; i++) {
        valueSum += product[i];
        if (i % (n + 1) == 0) diagonalSum += product[i];
    }

    int bufLen = snprintf(buf, bufCap, "dimension=%d\n", n);
    for (int i = 0; i < nn; i++) {
        bufLen += snprintf(buf + bufLen, bufCap - bufLen, "%lld,", (long long)product[i]);
    }
    bufLen += snprintf(buf + bufLen, bufCap - bufLen, "\n");

    SHA256 hasher;
    sha256_init(&hasher);
    sha256_update(&hasher, (uint8_t *)buf, bufLen);
    char checksumHex[65];
    sha256_hex(&hasher, checksumHex);

    JsonValue out = json_object();
    json_object_set(&out, "benchmark", json_string("matrix-multiplication"));
    json_object_set(&out, "version", json_number(1));
    json_object_set(&out, "dimension", json_number(n));
    json_object_set(&out, "elementCount", json_number(nn));
    json_object_set(&out, "valueSum", json_number(valueSum));
    json_object_set(&out, "diagonalSum", json_number(diagonalSum));
    json_object_set(&out, "checksum", json_string(checksumHex));
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

    int n = json_as_int(json_object_get(&root, "dimension"));
    int nn = n * n;
    JsonValue *leftArr = json_object_get(&root, "left");
    JsonValue *rightArr = json_object_get(&root, "right");
    int64_t *left = malloc(nn * sizeof(int64_t));
    int64_t *right = malloc(nn * sizeof(int64_t));
    for (int i = 0; i < nn; i++) {
        left[i] = json_as_int64(json_array_get(leftArr, i));
        right[i] = json_as_int64(json_array_get(rightArr, i));
    }
    json_free(&root);

    int bufCap = nn * 20 + 256;
    MmCtx ctx = {
        .dimension = n,
        .left = left,
        .right = right,
        .product = malloc(nn * sizeof(int64_t)),
        .buf = malloc(bufCap),
        .bufCap = bufCap
    };

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
    free(ctx.product);
    free(ctx.buf);
    free(left);
    free(right);
    return 0;
}
