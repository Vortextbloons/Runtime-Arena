#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include "json.h"
#include "sha256.h"
#include "sort.h"

#define PROTOCOL_VERSION "2.0.0"

typedef struct {
    int64_t id;
    int64_t score;
    int64_t timestamp;
} Record;

typedef struct {
    Record *inputRecs;
    Record *recs;
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

static int recordCmp(const void *a, const void *b) {
    const Record *ra = a, *rb = b;
    if (ra->score != rb->score) return ra->score > rb->score ? -1 : 1;
    if (ra->timestamp != rb->timestamp) return ra->timestamp < rb->timestamp ? -1 : 1;
    return ra->id < rb->id ? -1 : 1;
}

/* Type-specific insertion sort to avoid qsort function-pointer overhead */
INSERTION_SORT(sortRecords, Record, 
    (tmp.score > a[j].score) || 
    (tmp.score == a[j].score && tmp.timestamp < a[j].timestamp) ||
    (tmp.score == a[j].score && tmp.timestamp == a[j].timestamp && tmp.id < a[j].id)
)

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
    memcpy(c->recs, c->inputRecs, recCount * sizeof(Record));

    sortRecords(c->recs, recCount);

    int take = recCount < 10 ? recCount : 10;

    SHA256 hasher;
    sha256_init(&hasher);
    for (int i = 0; i < recCount; i++) {
        char line[128];
        int len = snprintf(line, sizeof(line), "%lld,%lld,%lld\n",
            (long long)c->recs[i].id, (long long)c->recs[i].score, (long long)c->recs[i].timestamp);
        sha256_update(&hasher, (uint8_t *)line, len);
    }
    char checksumHex[65];
    sha256_hex(&hasher, checksumHex);

    JsonValue out = json_object();
    json_object_set(&out, "benchmark", json_string("record-sorting"));
    json_object_set(&out, "version", json_number(1));
    json_object_set(&out, "recordCount", json_number(recCount));

    JsonValue firstArr = json_array();
    for (int i = 0; i < take; i++) {
        JsonValue r = json_object();
        json_object_set(&r, "id", json_number(c->recs[i].id));
        json_object_set(&r, "score", json_number(c->recs[i].score));
        json_object_set(&r, "timestamp", json_number(c->recs[i].timestamp));
        json_array_push(&firstArr, r);
    }
    json_object_set(&out, "firstRecords", firstArr);

    JsonValue lastArr = json_array();
    for (int i = recCount - take; i < recCount; i++) {
        JsonValue r = json_object();
        json_object_set(&r, "id", json_number(c->recs[i].id));
        json_object_set(&r, "score", json_number(c->recs[i].score));
        json_object_set(&r, "timestamp", json_number(c->recs[i].timestamp));
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
    Record *inputRecs = malloc(recCount * sizeof(Record));
    for (int i = 0; i < recCount; i++) {
        JsonValue *r = json_array_get(recsArr, i);
        inputRecs[i].id = json_as_int64(json_object_get(r, "id"));
        inputRecs[i].score = json_as_int64(json_object_get(r, "score"));
        inputRecs[i].timestamp = json_as_int64(json_object_get(r, "timestamp"));
    }
    json_free(&root);

    RsCtx ctx = {
        .inputRecs = inputRecs,
        .recs = malloc(recCount * sizeof(Record)),
        .recCount = recCount
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
    free(inputRecs);
    free(ctx.recs);
    return 0;
}
