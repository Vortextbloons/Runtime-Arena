#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <limits.h>
#include "json.h"
#include "sha256.h"

#define PROTOCOL_VERSION "2.0.0"

typedef struct {
    char accountId[64];
    char category[64];
    int64_t quantity;
    int64_t price;
} Row;

typedef struct {
    char category[64];
    int64_t quantity;
    int64_t value;
} CategoryAgg;

typedef struct {
    char accountId[64];
    int64_t value;
} AccountAgg;

typedef struct {
    Row *rows;
    int rowCount;
} AggCtx;

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

static int64_t parseI64(const char *p, const char *end) {
    int64_t val = 0;
    int neg = 0;
    if (p < end && *p == '-') { neg = 1; p++; }
    while (p < end && *p >= '0' && *p <= '9') {
        val = val * 10 + (*p - '0');
        p++;
    }
    return neg ? -val : val;
}

static Row *parseCSV(const char *content, int *outCount) {
    Row *rows = NULL;
    int count = 0, cap = 0;
    const char *p = content;

    while (*p && *p != '\n' && *p != '\r') p++;
    while (*p == '\n' || *p == '\r') p++;

    while (*p) {
        const char *lineStart = p;
        while (*p && *p != '\n' && *p != '\r') p++;
        const char *lineEnd = p;
        while (*p == '\n' || *p == '\r') p++;
        if (lineStart == lineEnd) continue;

        const char *fields[5];
        const char *fieldEnds[5];
        const char *f = lineStart;
        int fc = 0;
        for (int i = 0; i < 5 && f <= lineEnd; i++) {
            fields[i] = f;
            if (i < 4) {
                while (f < lineEnd && *f != ',') f++;
                fieldEnds[i] = f;
                if (f < lineEnd) f++;
            } else {
                fieldEnds[i] = lineEnd;
            }
            fc++;
        }
        if (fc < 5) continue;

        if (count >= cap) { cap = cap ? cap * 2 : 1024; rows = realloc(rows, cap * sizeof(Row)); }
        Row *r = &rows[count];
        memset(r, 0, sizeof(Row));
        int len;
        len = (int)(fieldEnds[1] - fields[1]);
        if (len > 63) len = 63;
        memcpy(r->accountId, fields[1], len);
        len = (int)(fieldEnds[2] - fields[2]);
        if (len > 63) len = 63;
        memcpy(r->category, fields[2], len);
        r->quantity = parseI64(fields[3], fieldEnds[3]);
        r->price = parseI64(fields[4], fieldEnds[4]);
        count++;
    }
    *outCount = count;
    return rows;
}

static uint32_t fnv1a(const char *s) {
    uint32_t h = 2166136261u;
    while (*s) { h ^= (uint8_t)*s++; h *= 16777619u; }
    return h;
}

#define CAT_CAP 256
#define CAT_MASK (CAT_CAP - 1)
#define ACCT_CAP 4096
#define ACCT_MASK (ACCT_CAP - 1)

static int catCmp(const void *a, const void *b) {
    return strcmp(((CategoryAgg*)a)->category, ((CategoryAgg*)b)->category);
}

static int acctCmp(const void *a, const void *b) {
    const AccountAgg *aa = a, *bb = b;
    if (aa->value != bb->value) return aa->value > bb->value ? -1 : 1;
    return strcmp(aa->accountId, bb->accountId);
}

static void buildChecksumString(const CategoryAgg *cats, int catCount,
                                 const AccountAgg *topAccts, int topCount,
                                 char **outStr, int *outLen) {
    int cap = 4096, len = 0;
    char *buf = malloc(cap);

    #define ENSURE(n) while (len + (n) >= cap) { cap *= 2; buf = realloc(buf, cap); }
    #define APPEND(s, sl) ENSURE(sl); memcpy(buf + len, s, sl); len += sl
    #define APPEND_STR(s) { const char *_s = (s); int _l = (int)strlen(_s); APPEND(_s, _l); }

    APPEND_STR("{\"Categories\":[");
    for (int i = 0; i < catCount; i++) {
        if (i > 0) { APPEND(",", 1); }
        char num[64];
        int nl;
        APPEND_STR("{\"category\":\"");
        APPEND_STR(cats[i].category);
        APPEND_STR("\",\"quantity\":");
        nl = snprintf(num, sizeof(num), "%lld", (long long)cats[i].quantity);
        APPEND(num, nl);
        APPEND_STR(",\"valueMinorUnits\":");
        nl = snprintf(num, sizeof(num), "%lld", (long long)cats[i].value);
        APPEND(num, nl);
        APPEND("}", 1);
    }
    APPEND_STR("],\"TopAccounts\":[");
    for (int i = 0; i < topCount; i++) {
        if (i > 0) { APPEND(",", 1); }
        char num[64];
        int nl;
        APPEND_STR("{\"accountId\":\"");
        APPEND_STR(topAccts[i].accountId);
        APPEND_STR("\",\"valueMinorUnits\":");
        nl = snprintf(num, sizeof(num), "%lld", (long long)topAccts[i].value);
        APPEND(num, nl);
        APPEND("}", 1);
    }
    APPEND_STR("]}");

    #undef ENSURE
    #undef APPEND
    #undef APPEND_STR

    buf[len] = '\0';
    *outStr = buf;
    *outLen = len;
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
    AggCtx *c = (AggCtx *)ctx;
    int rowCount = c->rowCount;
    Row *rows = c->rows;

    int64_t recordCount = 0, totalQuantity = 0, totalValue = 0;
    int64_t minTrans = INT64_MAX, maxTrans = 0;
    int catMapCount = 0;
    int acctMapCount = 0;

    CategoryAgg catMap[CAT_CAP];
    AccountAgg acctMap[ACCT_CAP];
    memset(catMap, 0, sizeof(catMap));
    memset(acctMap, 0, sizeof(acctMap));

    for (int i = 0; i < rowCount; i++) {
        int64_t value = rows[i].quantity * rows[i].price;
        recordCount++;
        totalQuantity += rows[i].quantity;
        totalValue += value;
        if (value < minTrans) minTrans = value;
        if (value > maxTrans) maxTrans = value;

        uint32_t h = fnv1a(rows[i].category);
        int idx = h & CAT_MASK;
        while (catMap[idx].category[0] != '\0' && strcmp(catMap[idx].category, rows[i].category) != 0)
            idx = (idx + 1) & CAT_MASK;
        if (catMap[idx].category[0] == '\0') {
            strcpy(catMap[idx].category, rows[i].category);
            catMapCount++;
        }
        catMap[idx].quantity += rows[i].quantity;
        catMap[idx].value += value;

        h = fnv1a(rows[i].accountId);
        idx = h & ACCT_MASK;
        while (acctMap[idx].accountId[0] != '\0' && strcmp(acctMap[idx].accountId, rows[i].accountId) != 0)
            idx = (idx + 1) & ACCT_MASK;
        if (acctMap[idx].accountId[0] == '\0') {
            strcpy(acctMap[idx].accountId, rows[i].accountId);
            acctMapCount++;
        }
        acctMap[idx].value += value;
    }

    CategoryAgg *sortedCats = malloc(catMapCount * sizeof(CategoryAgg));
    int scIdx = 0;
    for (int i = 0; i < CAT_CAP; i++) {
        if (catMap[i].category[0] != '\0') sortedCats[scIdx++] = catMap[i];
    }
    qsort(sortedCats, catMapCount, sizeof(CategoryAgg), catCmp);

    AccountAgg *sortedAccts = malloc(acctMapCount * sizeof(AccountAgg));
    int saIdx = 0;
    for (int i = 0; i < ACCT_CAP; i++) {
        if (acctMap[i].accountId[0] != '\0') sortedAccts[saIdx++] = acctMap[i];
    }
    qsort(sortedAccts, acctMapCount, sizeof(AccountAgg), acctCmp);
    int topCount = acctMapCount < 10 ? acctMapCount : 10;

    char *checksumStr;
    int checksumLen;
    buildChecksumString(sortedCats, catMapCount, sortedAccts, topCount, &checksumStr, &checksumLen);

    SHA256 sha;
    sha256_init(&sha);
    sha256_update(&sha, (uint8_t *)checksumStr, checksumLen);
    sha256_update(&sha, (uint8_t *)"\n", 1);
    char checksumHex[65];
    sha256_hex(&sha, checksumHex);
    free(checksumStr);

    JsonValue out = json_object();
    json_object_set(&out, "benchmark", json_string("aggregation"));
    json_object_set(&out, "version", json_number(1));
    json_object_set(&out, "recordCount", json_number(recordCount));
    json_object_set(&out, "totalQuantity", json_number(totalQuantity));
    json_object_set(&out, "totalValueMinorUnits", json_number(totalValue));
    json_object_set(&out, "minimumTransactionMinorUnits", json_number(minTrans));
    json_object_set(&out, "maximumTransactionMinorUnits", json_number(maxTrans));

    JsonValue catsArr = json_array();
    for (int j = 0; j < catMapCount; j++) {
        JsonValue cat = json_object();
        json_object_set(&cat, "category", json_string(sortedCats[j].category));
        json_object_set(&cat, "quantity", json_number(sortedCats[j].quantity));
        json_object_set(&cat, "valueMinorUnits", json_number(sortedCats[j].value));
        json_array_push(&catsArr, cat);
    }
    json_object_set(&out, "categories", catsArr);

    JsonValue topArr = json_array();
    for (int j = 0; j < topCount; j++) {
        JsonValue a = json_object();
        json_object_set(&a, "accountId", json_string(sortedAccts[j].accountId));
        json_object_set(&a, "valueMinorUnits", json_number(sortedAccts[j].value));
        json_array_push(&topArr, a);
    }
    json_object_set(&out, "topAccounts", topArr);
    json_object_set(&out, "checksum", json_string(checksumHex));

    char *dumped = json_dump(&out);
    json_free(&out);
    free(sortedCats);
    free(sortedAccts);
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

    char *csvContent = readFile(inputPath);
    int rowCount;
    Row *rows = parseCSV(csvContent, &rowCount);
    free(csvContent);

    AggCtx ctx = { .rows = rows, .rowCount = rowCount };

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
    free(rows);
    return 0;
}
