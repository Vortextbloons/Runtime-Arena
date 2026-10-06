#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <limits.h>
#include "sha256.h"
#include "sort.h"

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

/* Type-specific insertion sort to avoid qsort function-pointer overhead */
INSERTION_SORT(sortCategories, CategoryAgg, strcmp(tmp.category, a[j].category) < 0)
INSERTION_SORT(sortAccounts, AccountAgg,
    (tmp.value > a[j].value) ||
    (tmp.value == a[j].value && strcmp(tmp.accountId, a[j].accountId) < 0)
)

/* Growable byte buffer shared by the checksum and output builders */
typedef struct {
    char *data;
    int len;
    int cap;
} Buf;

static void bufEnsure(Buf *b, int extra) {
    if (b->len + extra >= b->cap) {
        while (b->len + extra >= b->cap) b->cap *= 2;
        b->data = realloc(b->data, b->cap);
    }
}

static void bufAppend(Buf *b, const char *s, int n) {
    bufEnsure(b, n + 1);
    memcpy(b->data + b->len, s, n);
    b->len += n;
}

static void bufStr(Buf *b, const char *s) {
    bufAppend(b, s, (int)strlen(s));
}

/* Two-digits-at-a-time integer writer via a 100-entry table */
static void bufI64(Buf *b, int64_t v) {
    static const char DIGITS[201] =
        "00010203040506070809"
        "10111213141516171819"
        "20212223242526272829"
        "30313233343536373839"
        "40414243444546474849"
        "50515253545556575859"
        "60616263646566676869"
        "70717273747576777879"
        "80818283848586878889"
        "90919293949596979899";
    char tmp[24];
    char *p = tmp + sizeof(tmp);
    uint64_t u = v < 0 ? (uint64_t)(-(v + 1)) + 1u : (uint64_t)v;
    while (u >= 100) {
        unsigned idx = (unsigned)(u % 100) * 2;
        p -= 2;
        p[0] = DIGITS[idx];
        p[1] = DIGITS[idx + 1];
        u /= 100;
    }
    if (u >= 10) {
        unsigned idx = (unsigned)u * 2;
        p -= 2;
        p[0] = DIGITS[idx];
        p[1] = DIGITS[idx + 1];
    } else {
        *--p = (char)('0' + u);
    }
    if (v < 0) *--p = '-';
    bufAppend(b, p, (int)(tmp + sizeof(tmp) - p));
}

/* One code path for aggregate entries: the checksum input and the final
 * output embed byte-identical fragments, serialized exactly once each. */
static void bufCatEntry(Buf *b, const char *name, int64_t q, int64_t v) {
    bufStr(b, "{\"category\":\"");
    bufStr(b, name);
    bufStr(b, "\",\"quantity\":");
    bufI64(b, q);
    bufStr(b, ",\"valueMinorUnits\":");
    bufI64(b, v);
    bufAppend(b, "}", 1);
}

static void bufAcctEntry(Buf *b, const char *id, int64_t v) {
    bufStr(b, "{\"accountId\":\"");
    bufStr(b, id);
    bufStr(b, "\",\"valueMinorUnits\":");
    bufI64(b, v);
    bufAppend(b, "}", 1);
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

/* Reusable scratch: no per-iteration malloc/free in the timed kernel */
static CategoryAgg catMap[CAT_CAP];
static AccountAgg acctMap[ACCT_CAP];
static CategoryAgg sortedCats[CAT_CAP];
static AccountAgg sortedAccts[ACCT_CAP];
static Buf chkBuf = { NULL, 0, 0 };
static Buf outBuf = { NULL, 0, 0 };

static char *produce_output(void *ctx, size_t *out_len) {
    AggCtx *c = (AggCtx *)ctx;
    int rowCount = c->rowCount;
    Row *rows = c->rows;

    int64_t recordCount = 0, totalQuantity = 0, totalValue = 0;
    int64_t minTrans = INT64_MAX, maxTrans = 0;
    int catMapCount = 0;
    int acctMapCount = 0;

    memset(catMap, 0, sizeof(catMap));
    memset(acctMap, 0, sizeof(acctMap));

    for (int i = 0; i < rowCount; i++) {
        int64_t quantity = rows[i].quantity;
        int64_t value = quantity * rows[i].price;
        recordCount++;
        totalQuantity += quantity;
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
        catMap[idx].quantity += quantity;
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

    int scIdx = 0;
    for (int i = 0; i < CAT_CAP; i++) {
        if (catMap[i].category[0] != '\0') sortedCats[scIdx++] = catMap[i];
    }
    sortCategories(sortedCats, catMapCount);

    int saIdx = 0;
    for (int i = 0; i < ACCT_CAP; i++) {
        if (acctMap[i].accountId[0] != '\0') sortedAccts[saIdx++] = acctMap[i];
    }
    sortAccounts(sortedAccts, acctMapCount);
    int topCount = acctMapCount < 10 ? acctMapCount : 10;

    if (!chkBuf.data) {
        chkBuf.cap = 4096;
        chkBuf.data = malloc(chkBuf.cap);
    }
    chkBuf.len = 0;
    bufStr(&chkBuf, "{\"Categories\":[");
    for (int i = 0; i < catMapCount; i++) {
        if (i > 0) bufAppend(&chkBuf, ",", 1);
        bufCatEntry(&chkBuf, sortedCats[i].category, sortedCats[i].quantity, sortedCats[i].value);
    }
    bufStr(&chkBuf, "],\"TopAccounts\":[");
    for (int i = 0; i < topCount; i++) {
        if (i > 0) bufAppend(&chkBuf, ",", 1);
        bufAcctEntry(&chkBuf, sortedAccts[i].accountId, sortedAccts[i].value);
    }
    bufStr(&chkBuf, "]}");

    SHA256 sha;
    sha256_init(&sha);
    sha256_update(&sha, (const uint8_t *)chkBuf.data, chkBuf.len);
    sha256_update(&sha, (const uint8_t *)"\n", 1);
    char checksumHex[65];
    sha256_hex(&sha, checksumHex);

    if (!outBuf.data) {
        outBuf.cap = 8192;
        outBuf.data = malloc(outBuf.cap);
    }
    outBuf.len = 0;
    bufStr(&outBuf, "{\"benchmark\":\"aggregation\",\"version\":1,\"recordCount\":");
    bufI64(&outBuf, recordCount);
    bufStr(&outBuf, ",\"totalQuantity\":");
    bufI64(&outBuf, totalQuantity);
    bufStr(&outBuf, ",\"totalValueMinorUnits\":");
    bufI64(&outBuf, totalValue);
    bufStr(&outBuf, ",\"minimumTransactionMinorUnits\":");
    bufI64(&outBuf, minTrans);
    bufStr(&outBuf, ",\"maximumTransactionMinorUnits\":");
    bufI64(&outBuf, maxTrans);
    bufStr(&outBuf, ",\"categories\":[");
    for (int i = 0; i < catMapCount; i++) {
        if (i > 0) bufAppend(&outBuf, ",", 1);
        bufCatEntry(&outBuf, sortedCats[i].category, sortedCats[i].quantity, sortedCats[i].value);
    }
    bufStr(&outBuf, "],\"topAccounts\":[");
    for (int i = 0; i < topCount; i++) {
        if (i > 0) bufAppend(&outBuf, ",", 1);
        bufAcctEntry(&outBuf, sortedAccts[i].accountId, sortedAccts[i].value);
    }
    bufStr(&outBuf, "],\"checksum\":\"");
    bufStr(&outBuf, checksumHex);
    bufStr(&outBuf, "\"}");
    bufEnsure(&outBuf, 1);
    outBuf.data[outBuf.len] = '\0';

    *out_len = (size_t)outBuf.len;
    return outBuf.data;
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
    /* Copy of the reusable buffer for finish, since produce_output reuses it */
    char *savedOutput = NULL;
    size_t savedLen = 0;
    emit_line("{\"type\":\"ready\",\"protocolVersion\":\"" PROTOCOL_VERSION "\"}");
    while (read_stdin_line(line, sizeof(line))) {
        if (!line[0]) continue;
        if (protocol_field(line, "type", field, sizeof(field)) && strcmp(field, "run") == 0) {
            long requestId = atol(protocol_field(line, "requestId", field, sizeof(field)));
            lastOutput = produce_output(&ctx, &lastLen);
            digest_hex_bytes((const uint8_t *)lastOutput, lastLen, digest);
            printf("{\"type\":\"result\",\"requestId\":%ld,\"digest\":\"%s\"}\n", requestId, digest);
            fflush(stdout);
        } else if (protocol_field(line, "type", field, sizeof(field)) && strcmp(field, "finish") == 0) {
            savedLen = lastLen;
            savedOutput = malloc(savedLen ? savedLen : 1);
            if (lastLen) memcpy(savedOutput, lastOutput, lastLen);
            digest_hex_bytes((const uint8_t *)savedOutput, savedLen, digest);
            FILE *f = fopen(outputPath, "wb");
            fwrite(savedOutput, 1, savedLen, f);
            fclose(f);
            printf("{\"type\":\"finish\",\"digest\":\"%s\"}\n", digest);
            fflush(stdout);
            break;
        }
    }

    free(savedOutput);
    free(rows);
    return 0;
}
