#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include "json.h"
#include "sha256.h"
#include "sort.h"

#define PROTOCOL_VERSION "2.0.0"

typedef struct {
    char word[64];
    int count;
} Entry;

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

/* Type-specific insertion sort to avoid qsort function-pointer overhead */
INSERTION_SORT(sortEntries, Entry, 
    (tmp.count > a[j].count) || 
    (tmp.count == a[j].count && strcmp(tmp.word, a[j].word) < 0)
)

typedef struct { char word[64]; int count; } MapEntry;

static uint32_t hashStr(const char *s) {
    uint32_t h = 2166136261u;
    while (*s) { h ^= (uint8_t)*s++; h *= 16777619u; }
    return h;
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

typedef struct {
    char **words;
    int totalWords;
    int mapCap;
    MapEntry *map;
    Entry *entries;
} WfCtx;

static char *produce_output(void *ctx, size_t *out_len) {
    WfCtx *c = (WfCtx *)ctx;
    memset(c->map, 0, c->mapCap * sizeof(MapEntry));
    int mapUsed = 0;
    int mask = c->mapCap - 1;

    for (int i = 0; i < c->totalWords; i++) {
        uint32_t h = hashStr(c->words[i]);
        int idx = h & mask;
        while (c->map[idx].word[0] != '\0' && strcmp(c->map[idx].word, c->words[i]) != 0)
            idx = (idx + 1) & mask;
        if (c->map[idx].word[0] == '\0') {
            strcpy(c->map[idx].word, c->words[i]);
            mapUsed++;
        }
        c->map[idx].count++;
    }

    int eIdx = 0;
    for (int i = 0; i < c->mapCap; i++) {
        if (c->map[i].word[0] != '\0') {
            strcpy(c->entries[eIdx].word, c->map[i].word);
            c->entries[eIdx].count = c->map[i].count;
            eIdx++;
        }
    }
    sortEntries(c->entries, mapUsed);

    SHA256 hasher;
    sha256_init(&hasher);
    for (int i = 0; i < mapUsed; i++) {
        char line[128];
        int len = snprintf(line, sizeof(line), "%s,%d\n", c->entries[i].word, c->entries[i].count);
        sha256_update(&hasher, (uint8_t *)line, len);
    }
    char checksumHex[65];
    sha256_hex(&hasher, checksumHex);

    int topCount = mapUsed < 10 ? mapUsed : 10;
    JsonValue out = json_object();
    json_object_set(&out, "benchmark", json_string("word-frequency"));
    json_object_set(&out, "version", json_number(1));
    json_object_set(&out, "totalWords", json_number(c->totalWords));
    json_object_set(&out, "uniqueWords", json_number(mapUsed));
    JsonValue topArr = json_array();
    for (int i = 0; i < topCount; i++) {
        JsonValue e = json_object();
        json_object_set(&e, "word", json_string(c->entries[i].word));
        json_object_set(&e, "count", json_number(c->entries[i].count));
        json_array_push(&topArr, e);
    }
    json_object_set(&out, "topWords", topArr);
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
    JsonValue *wordsArr = json_object_get(&root, "words");
    int totalWords = (int)wordsArr->as.array.count;
    char **words = malloc(totalWords * sizeof(char *));
    for (int i = 0; i < totalWords; i++)
        words[i] = strdup(json_as_string(json_array_get(wordsArr, i)));
    json_free(&root);

    int mapCap = 1;
    while (mapCap < totalWords * 2) mapCap <<= 1;

    WfCtx ctx = {
        .words = words,
        .totalWords = totalWords,
        .mapCap = mapCap,
        .map = calloc(mapCap, sizeof(MapEntry)),
        .entries = malloc(totalWords * sizeof(Entry))
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
    for (int i = 0; i < totalWords; i++) free(words[i]);
    free(words);
    free(ctx.map);
    free(ctx.entries);
    return 0;
}
