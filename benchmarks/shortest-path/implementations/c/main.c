#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <limits.h>
#include "json.h"
#include "sha256.h"

#define PROTOCOL_VERSION "2.0.0"

typedef struct {
    int from;
    int to;
    int64_t weight;
} Edge;

typedef struct {
    int id;
    int source;
    int destination;
} Query;

typedef struct {
    int id;
    int hasDistance;
    int64_t distance;
    int *path;
    int pathLen;
} Result;

typedef struct { int64_t dist; int prev; } PQItem;

typedef struct {
    PQItem *data;
    int size;
    int cap;
} MinHeap;

typedef struct {
    int vertexCount;
    Edge *edges;
    int edgeCount;
    Query *queries;
    int queryCount;
    int **adj;
    int *adjCount;
    int64_t *dist;
    int *prev;
    MinHeap pq;
} SpCtx;

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

static void heapPush(MinHeap *h, int64_t dist, int node) {
    if (h->size >= h->cap) { h->cap = h->cap ? h->cap * 2 : 256; h->data = realloc(h->data, h->cap * sizeof(PQItem)); }
    int i = h->size++;
    h->data[i] = (PQItem){dist, node};
    while (i > 0) {
        int p = (i - 1) / 2;
        if (h->data[p].dist <= h->data[i].dist) break;
        PQItem tmp = h->data[p]; h->data[p] = h->data[i]; h->data[i] = tmp;
        i = p;
    }
}

static PQItem heapPop(MinHeap *h) {
    PQItem top = h->data[0];
    h->data[0] = h->data[--h->size];
    int i = 0;
    while (1) {
        int smallest = i, l = 2*i+1, r = 2*i+2;
        if (l < h->size && h->data[l].dist < h->data[smallest].dist) smallest = l;
        if (r < h->size && h->data[r].dist < h->data[smallest].dist) smallest = r;
        if (smallest == i) break;
        PQItem tmp = h->data[i]; h->data[i] = h->data[smallest]; h->data[smallest] = tmp;
        i = smallest;
    }
    return top;
}

static char *produce_output(void *ctx, size_t *out_len) {
    SpCtx *c = (SpCtx *)ctx;
    Result *results = malloc(c->queryCount * sizeof(Result));

    for (int qi = 0; qi < c->queryCount; qi++) {
        Query *q = &c->queries[qi];
        for (int v = 0; v < c->vertexCount; v++) { c->dist[v] = INT64_MAX; c->prev[v] = -1; }

        c->pq.size = 0;
        c->dist[q->source] = 0;
        heapPush(&c->pq, 0, q->source);

        while (c->pq.size > 0) {
            PQItem item = heapPop(&c->pq);
            if (item.dist != c->dist[item.prev]) continue;
            if (item.prev == q->destination) break;
            for (int ei = 0; ei < c->adjCount[item.prev]; ei++) {
                Edge *e = &c->edges[c->adj[item.prev][ei]];
                int64_t nextCost = item.dist + e->weight;
                if (nextCost < c->dist[e->to]) {
                    c->dist[e->to] = nextCost;
                    c->prev[e->to] = item.prev;
                    heapPush(&c->pq, nextCost, e->to);
                }
            }
        }

        results[qi].id = q->id;
        if (c->dist[q->destination] == INT64_MAX) {
            results[qi].hasDistance = 0;
            results[qi].distance = 0;
            results[qi].path = NULL;
            results[qi].pathLen = 0;
        } else {
            results[qi].hasDistance = 1;
            results[qi].distance = c->dist[q->destination];
            int pathCap = 16;
            int *path = malloc(pathCap * sizeof(int));
            int pathLen = 0;
            for (int v = q->destination; v != -1; v = c->prev[v]) {
                if (pathLen >= pathCap) { pathCap *= 2; path = realloc(path, pathCap * sizeof(int)); }
                path[pathLen++] = v;
            }
            for (int j = 0; j < pathLen / 2; j++) {
                int tmp = path[j]; path[j] = path[pathLen-1-j]; path[pathLen-1-j] = tmp;
            }
            results[qi].path = path;
            results[qi].pathLen = pathLen;
        }
    }

    JsonValue out = json_object();
    json_object_set(&out, "benchmark", json_string("shortest-path"));
    json_object_set(&out, "version", json_number(1));
    JsonValue resultsArr = json_array();
    for (int i = 0; i < c->queryCount; i++) {
        JsonValue entry = json_object();
        json_object_set(&entry, "queryId", json_number(results[i].id));
        if (results[i].hasDistance) {
            json_object_set(&entry, "distance", json_number(results[i].distance));
        } else {
            json_object_set(&entry, "distance", json_null());
        }
        JsonValue pathArr = json_array();
        for (int j = 0; j < results[i].pathLen; j++)
            json_array_push(&pathArr, json_number(results[i].path[j]));
        json_object_set(&entry, "path", pathArr);
        json_array_push(&resultsArr, entry);
    }
    json_object_set(&out, "results", resultsArr);
    char *dumped = json_dump(&out);
    json_free(&out);

    for (int i = 0; i < c->queryCount; i++) free(results[i].path);
    free(results);
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

    SpCtx ctx = {0};
    ctx.vertexCount = json_as_int(json_object_get(&root, "vertexCount"));

    JsonValue *edgesArr = json_object_get(&root, "edges");
    ctx.edgeCount = (int)edgesArr->as.array.count;
    ctx.edges = malloc(ctx.edgeCount * sizeof(Edge));
    for (int i = 0; i < ctx.edgeCount; i++) {
        JsonValue *e = json_array_get(edgesArr, i);
        ctx.edges[i].from = json_as_int(json_object_get(e, "from"));
        ctx.edges[i].to = json_as_int(json_object_get(e, "to"));
        ctx.edges[i].weight = json_as_int64(json_object_get(e, "weight"));
    }

    JsonValue *queriesArr = json_object_get(&root, "queries");
    ctx.queryCount = (int)queriesArr->as.array.count;
    ctx.queries = malloc(ctx.queryCount * sizeof(Query));
    for (int i = 0; i < ctx.queryCount; i++) {
        JsonValue *q = json_array_get(queriesArr, i);
        ctx.queries[i].id = json_as_int(json_object_get(q, "id"));
        ctx.queries[i].source = json_as_int(json_object_get(q, "source"));
        ctx.queries[i].destination = json_as_int(json_object_get(q, "destination"));
    }
    json_free(&root);

    ctx.adj = calloc(ctx.vertexCount, sizeof(int*));
    ctx.adjCount = calloc(ctx.vertexCount, sizeof(int));
    int *adjCap = calloc(ctx.vertexCount, sizeof(int));
    for (int i = 0; i < ctx.edgeCount; i++) {
        int from = ctx.edges[i].from;
        if (ctx.adjCount[from] >= adjCap[from]) {
            adjCap[from] = adjCap[from] ? adjCap[from] * 2 : 4;
            ctx.adj[from] = realloc(ctx.adj[from], adjCap[from] * sizeof(int));
        }
        ctx.adj[from][ctx.adjCount[from]++] = i;
    }
    free(adjCap);

    ctx.dist = malloc(ctx.vertexCount * sizeof(int64_t));
    ctx.prev = malloc(ctx.vertexCount * sizeof(int));
    ctx.pq = (MinHeap){0};

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
    free(ctx.dist);
    free(ctx.prev);
    free(ctx.pq.data);
    for (int i = 0; i < ctx.vertexCount; i++) free(ctx.adj[i]);
    free(ctx.adj);
    free(ctx.adjCount);
    free(ctx.edges);
    free(ctx.queries);
    return 0;
}
