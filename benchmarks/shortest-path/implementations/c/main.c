#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <time.h>
#include <limits.h>
#include "json.h"

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
    int vertexCount;
    Edge *edges;
    int edgeCount;
    Query *queries;
    int queryCount;
} Input;

typedef struct {
    int id;
    int hasDistance;
    int64_t distance;
    int *path;
    int pathLen;
} Result;

typedef struct {
    int iteration;
    int64_t kernelTimeNanoseconds;
} Sample;

typedef struct { int64_t dist; int prev; } PQItem;

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

static Input parseInput(const char *jsonStr) {
    Input in = {0};
    JsonValue root = json_parse(jsonStr);
    in.vertexCount = json_as_int(json_object_get(&root, "vertexCount"));

    JsonValue *edgesArr = json_object_get(&root, "edges");
    in.edgeCount = (int)edgesArr->as.array.count;
    in.edges = malloc(in.edgeCount * sizeof(Edge));
    for (int i = 0; i < in.edgeCount; i++) {
        JsonValue *e = json_array_get(edgesArr, i);
        in.edges[i].from = json_as_int(json_object_get(e, "from"));
        in.edges[i].to = json_as_int(json_object_get(e, "to"));
        in.edges[i].weight = json_as_int64(json_object_get(e, "weight"));
    }

    JsonValue *queriesArr = json_object_get(&root, "queries");
    in.queryCount = (int)queriesArr->as.array.count;
    in.queries = malloc(in.queryCount * sizeof(Query));
    for (int i = 0; i < in.queryCount; i++) {
        JsonValue *q = json_array_get(queriesArr, i);
        in.queries[i].id = json_as_int(json_object_get(q, "id"));
        in.queries[i].source = json_as_int(json_object_get(q, "source"));
        in.queries[i].destination = json_as_int(json_object_get(q, "destination"));
    }

    json_free(&root);
    return in;
}

/* Simple min-heap priority queue */
typedef struct {
    PQItem *data;
    int size;
    int cap;
} MinHeap;

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

static Result *kernel(const Input *in, int *outCount) {
    /* Build adjacency list */
    int **adj = calloc(in->vertexCount, sizeof(int*));
    int *adjCount = calloc(in->vertexCount, sizeof(int));
    int *adjCap = calloc(in->vertexCount, sizeof(int));
    for (int i = 0; i < in->edgeCount; i++) {
        int from = in->edges[i].from;
        if (adjCount[from] >= adjCap[from]) {
            adjCap[from] = adjCap[from] ? adjCap[from] * 2 : 4;
            adj[from] = realloc(adj[from], adjCap[from] * sizeof(int));
        }
        adj[from][adjCount[from]++] = i;
    }

    Result *results = malloc(in->queryCount * sizeof(Result));
    *outCount = in->queryCount;

    for (int qi = 0; qi < in->queryCount; qi++) {
        Query *q = &in->queries[qi];
        int64_t *dist = malloc(in->vertexCount * sizeof(int64_t));
        int *prev = malloc(in->vertexCount * sizeof(int));
        for (int i = 0; i < in->vertexCount; i++) { dist[i] = INT64_MAX; prev[i] = -1; }

        MinHeap pq = {0};
        dist[q->source] = 0;
        heapPush(&pq, 0, q->source);

        while (pq.size > 0) {
            PQItem item = heapPop(&pq);
            if (item.dist != dist[item.prev]) continue;
            for (int ei = 0; ei < adjCount[item.prev]; ei++) {
                Edge *e = &in->edges[adj[item.prev][ei]];
                int64_t nextCost = item.dist + e->weight;
                if (nextCost < dist[e->to]) {
                    dist[e->to] = nextCost;
                    prev[e->to] = item.prev;
                    heapPush(&pq, nextCost, e->to);
                }
            }
        }

        results[qi].id = q->id;
        if (dist[q->destination] == INT64_MAX) {
            results[qi].hasDistance = 0;
            results[qi].distance = 0;
            results[qi].path = NULL;
            results[qi].pathLen = 0;
        } else {
            results[qi].hasDistance = 1;
            results[qi].distance = dist[q->destination];
            /* Reconstruct path */
            int pathCap = 16;
            int *path = malloc(pathCap * sizeof(int));
            int pathLen = 0;
            for (int v = q->destination; v != -1; v = prev[v]) {
                if (pathLen >= pathCap) { pathCap *= 2; path = realloc(path, pathCap * sizeof(int)); }
                path[pathLen++] = v;
            }
            /* Reverse */
            for (int i = 0; i < pathLen / 2; i++) {
                int tmp = path[i]; path[i] = path[pathLen-1-i]; path[pathLen-1-i] = tmp;
            }
            results[qi].path = path;
            results[qi].pathLen = pathLen;
        }

        free(dist); free(prev); free(pq.data);
    }

    for (int i = 0; i < in->vertexCount; i++) free(adj[i]);
    free(adj); free(adjCount); free(adjCap);

    return results;
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

    char *inputJson = readFile(inputPath);
    Input in = parseInput(inputJson);
    free(inputJson);

    Sample samples[1024];
    int sampleCount = 0;
    int64_t kernelTimes[1024];
    int ktCount = 0;
    Result *lastResults = NULL;
    int lastResultCount = 0;

    for (int i = -warmup; ; i++) {
        if (lastResults) {
            for (int j = 0; j < lastResultCount; j++) free(lastResults[j].path);
            free(lastResults);
        }

        struct timespec t1, t2;
        clock_gettime(CLOCK_MONOTONIC, &t1);
        lastResults = kernel(&in, &lastResultCount);
        clock_gettime(CLOCK_MONOTONIC, &t2);

        int64_t elapsed = (int64_t)(t2.tv_sec - t1.tv_sec) * 1000000000LL + (t2.tv_nsec - t1.tv_nsec);
        if (elapsed < 1) elapsed = 1;

        if (i >= 0) {
            kernelTimes[ktCount++] = elapsed;
            samples[sampleCount].iteration = sampleCount + 1;
            samples[sampleCount].kernelTimeNanoseconds = elapsed;
            sampleCount++;
            if (ktCount >= maxIter || (ktCount >= minIter && ciWidth(kernelTimes, ktCount) <= targetCi))
                break;
        }
    }

    /* Write output JSON */
    {
        JsonValue out = json_object();
        json_object_set(&out, "benchmark", json_string("shortest-path"));
        json_object_set(&out, "version", json_number(1));
        JsonValue resultsArr = json_array();
        for (int i = 0; i < lastResultCount; i++) {
            JsonValue entry = json_object();
            json_object_set(&entry, "queryId", json_number(lastResults[i].id));
            if (lastResults[i].hasDistance) {
                json_object_set(&entry, "distance", json_number(lastResults[i].distance));
            } else {
                json_object_set(&entry, "distance", json_null());
            }
            JsonValue pathArr = json_array();
            for (int j = 0; j < lastResults[i].pathLen; j++)
                json_array_push(&pathArr, json_number(lastResults[i].path[j]));
            json_object_set(&entry, "path", pathArr);
            json_array_push(&resultsArr, entry);
        }
        json_object_set(&out, "results", resultsArr);
        char *dumped = json_dump(&out);
        FILE *f = fopen(outputPath, "wb");
        fwrite(dumped, 1, strlen(dumped), f);
        fclose(f);
        free(dumped);
        json_free(&out);
    }

    /* Write timing JSON */
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

    for (int i = 0; i < lastResultCount; i++) free(lastResults[i].path);
    free(lastResults);
    free(in.edges);
    free(in.queries);
    return 0;
}
