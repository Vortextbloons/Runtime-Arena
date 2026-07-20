#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <time.h>
#include <limits.h>
#include "json.h"
#include "sha256.h"

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

    char *csvContent = readFile(inputPath);
    int rowCount;
    Row *rows = parseCSV(csvContent, &rowCount);
    free(csvContent);

    Sample samples[1024];
    int sampleCount = 0;
    int64_t kernelTimes[1024];
    int ktCount = 0;

    CategoryAgg catMap[CAT_CAP];
    AccountAgg acctMap[ACCT_CAP];

    for (int iter = -warmup; ; iter++) {
        int64_t recordCount = 0, totalQuantity = 0, totalValue = 0;
        int64_t minTrans = INT64_MAX, maxTrans = 0;
        int catMapCount = 0;
        int acctMapCount = 0;

        memset(catMap, 0, sizeof(catMap));
        memset(acctMap, 0, sizeof(acctMap));

        struct timespec t1, t2;
        clock_gettime(CLOCK_MONOTONIC, &t1);

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

        clock_gettime(CLOCK_MONOTONIC, &t2);
        int64_t elapsed = (int64_t)(t2.tv_sec - t1.tv_sec) * 1000000000LL + (t2.tv_nsec - t1.tv_nsec);
        if (elapsed < 1) elapsed = 1;

        free(sortedCats);
        free(sortedAccts);

        if (iter >= 0) {
            kernelTimes[ktCount++] = elapsed;
            samples[sampleCount].iteration = sampleCount + 1;
            samples[sampleCount].kernelTimeNanoseconds = elapsed;
            sampleCount++;

            if (ktCount >= maxIter || (ktCount >= minIter && ciWidth(kernelTimes, ktCount) <= targetCi)) {
                CategoryAgg *finalCats = malloc(catMapCount * sizeof(CategoryAgg));
                AccountAgg *finalAccts = malloc(acctMapCount * sizeof(CategoryAgg));
                int fi = 0;
                for (int i = 0; i < CAT_CAP; i++) {
                    if (catMap[i].category[0] != '\0') finalCats[fi++] = catMap[i];
                }
                qsort(finalCats, catMapCount, sizeof(CategoryAgg), catCmp);
                fi = 0;
                for (int i = 0; i < ACCT_CAP; i++) {
                    if (acctMap[i].accountId[0] != '\0') finalAccts[fi++] = acctMap[i];
                }
                qsort(finalAccts, acctMapCount, sizeof(AccountAgg), acctCmp);

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
                    JsonValue c = json_object();
                    json_object_set(&c, "category", json_string(finalCats[j].category));
                    json_object_set(&c, "quantity", json_number(finalCats[j].quantity));
                    json_object_set(&c, "valueMinorUnits", json_number(finalCats[j].value));
                    json_array_push(&catsArr, c);
                }
                json_object_set(&out, "categories", catsArr);

                JsonValue topArr = json_array();
                for (int j = 0; j < topCount; j++) {
                    JsonValue a = json_object();
                    json_object_set(&a, "accountId", json_string(finalAccts[j].accountId));
                    json_object_set(&a, "valueMinorUnits", json_number(finalAccts[j].value));
                    json_array_push(&topArr, a);
                }
                json_object_set(&out, "topAccounts", topArr);
                json_object_set(&out, "checksum", json_string(checksumHex));

                char *dumped = json_dump(&out);
                FILE *f = fopen(outputPath, "wb");
                fwrite(dumped, 1, strlen(dumped), f);
                fclose(f);
                free(dumped);
                json_free(&out);
                free(finalCats);
                free(finalAccts);
                break;
            }
        }
    }

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

    free(rows);
    return 0;
}
