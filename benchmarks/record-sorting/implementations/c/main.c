#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include "json.h"
#include "sha256.h"

#define PROTOCOL_VERSION "2.0.0"
#define RADIX_BITS 16
#define RADIX_SIZE 65536

typedef struct {
    int64_t id;
    int64_t score;
    int64_t timestamp;
} Record;

typedef struct {
    const Record *inputRecs;
    Record *bufA;
    Record *bufB;
    uint32_t *counts;
    int recCount;
} RsCtx;

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

static inline uint64_t rkey(const Record *r, int sel) {
    if (sel == 0) return (uint64_t)r->id ^ 0x8000000000000000ULL;
    if (sel == 1) return (uint64_t)r->timestamp ^ 0x8000000000000000ULL;
    /* score descending: invert ascending-preserving transform */
    return (uint64_t)r->score ^ 0x7FFFFFFFFFFFFFFFULL;
}

static void radix_pass(const Record *src, Record *dst, size_t n, int sel, int shift, uint32_t *cnt) {
    memset(cnt, 0, RADIX_SIZE * sizeof(uint32_t));
    for (size_t i = 0; i < n; i++)
        cnt[(rkey(&src[i], sel) >> shift) & 0xFFFFu]++;
    uint32_t sum = 0;
    for (uint32_t d = 0; d < RADIX_SIZE; d++) {
        uint32_t c = cnt[d];
        cnt[d] = sum;
        sum += c;
    }
    for (size_t i = 0; i < n; i++) {
        uint32_t dg = (rkey(&src[i], sel) >> shift) & 0xFFFFu;
        dst[cnt[dg]++] = src[i];
    }
}

/* 12 stable LSD passes over (id, timestamp, score-desc) 64-bit keys.
 * Fully general: no assumptions about value ranges. */
static const Record *radix_sort(RsCtx *c) {
    size_t n = (size_t)c->recCount;
    const Record *src = c->inputRecs;
    Record *dst = c->bufA;
    for (int pass = 0; pass < 12; pass++) {
        int sel = pass >> 2;
        int shift = (pass & 3) << 4;
        radix_pass(src, dst, n, sel, shift, c->counts);
        src = dst;
        dst = (dst == c->bufA) ? c->bufB : c->bufA;
    }
    return src;
}

typedef struct {
    SHA256 *hasher;
    char buf[65536];
    size_t pos;
} HashWriter;

static inline void hw_byte(HashWriter *w, char b) {
    if (w->pos == sizeof(w->buf)) {
        sha256_update(w->hasher, (const uint8_t *)w->buf, w->pos);
        w->pos = 0;
    }
    w->buf[w->pos++] = b;
}

static void hw_i64(HashWriter *w, int64_t v) {
    if (v == INT64_MIN) {
        static const char m[] = "-9223372036854775808";
        for (size_t i = 0; i < sizeof(m) - 1; i++) hw_byte(w, m[i]);
        return;
    }
    if (v < 0) { hw_byte(w, '-'); v = -v; }
    char tmp[20];
    int len = 0;
    do { tmp[len++] = (char)('0' + v % 10); v /= 10; } while (v);
    while (len > 0) hw_byte(w, tmp[--len]);
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
    RsCtx *c = (RsCtx *)ctx;
    int recCount = c->recCount;

    const Record *sorted = radix_sort(c);

    int take = recCount < 10 ? recCount : 10;

    SHA256 hasher;
    sha256_init(&hasher);
    HashWriter w = { .hasher = &hasher, .pos = 0 };
    for (int i = 0; i < recCount; i++) {
        hw_i64(&w, sorted[i].id); hw_byte(&w, ',');
        hw_i64(&w, sorted[i].score); hw_byte(&w, ',');
        hw_i64(&w, sorted[i].timestamp); hw_byte(&w, '\n');
    }
    if (w.pos > 0) sha256_update(&hasher, (const uint8_t *)w.buf, w.pos);
    char checksumHex[65];
    sha256_hex(&hasher, checksumHex);

    JsonValue out = json_object();
    json_object_set(&out, "benchmark", json_string("record-sorting"));
    json_object_set(&out, "version", json_number(1));
    json_object_set(&out, "recordCount", json_number(recCount));

    JsonValue firstArr = json_array();
    for (int i = 0; i < take; i++) {
        JsonValue r = json_object();
        json_object_set(&r, "id", json_number(sorted[i].id));
        json_object_set(&r, "score", json_number(sorted[i].score));
        json_object_set(&r, "timestamp", json_number(sorted[i].timestamp));
        json_array_push(&firstArr, r);
    }
    json_object_set(&out, "firstRecords", firstArr);

    JsonValue lastArr = json_array();
    for (int i = recCount - take; i < recCount; i++) {
        JsonValue r = json_object();
        json_object_set(&r, "id", json_number(sorted[i].id));
        json_object_set(&r, "score", json_number(sorted[i].score));
        json_object_set(&r, "timestamp", json_number(sorted[i].timestamp));
        json_array_push(&lastArr, r);
    }
    json_object_set(&out, "lastRecords", lastArr);
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
    JsonValue *recsArr = json_object_get(&root, "records");
    int recCount = (int)recsArr->as.array.count;
    Record *inputRecs = malloc(recCount * sizeof(Record) + 1);
    for (int i = 0; i < recCount; i++) {
        JsonValue *r = json_array_get(recsArr, i);
        inputRecs[i].id = json_as_int64(json_object_get(r, "id"));
        inputRecs[i].score = json_as_int64(json_object_get(r, "score"));
        inputRecs[i].timestamp = json_as_int64(json_object_get(r, "timestamp"));
    }
    json_free(&root);

    RsCtx ctx = {
        .inputRecs = inputRecs,
        .bufA = malloc(recCount * sizeof(Record) + 1),
        .bufB = malloc(recCount * sizeof(Record) + 1),
        .counts = malloc(RADIX_SIZE * sizeof(uint32_t)),
        .recCount = recCount
    };
    if (!ctx.bufA || !ctx.bufB || !ctx.counts) {
        fprintf(stderr, "out of memory\n");
        return 1;
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

    free(lastOutput);
    free(inputRecs);
    free(ctx.bufA);
    free(ctx.bufB);
    free(ctx.counts);
    return 0;
}
