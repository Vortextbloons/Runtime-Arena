#ifndef ARENA_PROTOCOL_H
#define ARENA_PROTOCOL_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "sha256.h"

#define ARENA_PROTOCOL_VERSION "2.0.0"

static const char *arena_arg(int argc, char **argv, const char *name) {
    for (int i = 0; i + 1 < argc; i++) {
        if (strcmp(argv[i], name) == 0) return argv[i + 1];
    }
    fprintf(stderr, "missing %s\n", name);
    exit(1);
}

static void arena_digest_hex(const unsigned char *data, size_t len, char out[65]) {
    SHA256 ctx;
    unsigned char digest[32];
    sha256_init(&ctx);
    sha256_update(&ctx, data, len);
    sha256_final(&ctx, digest);
    static const char hex[] = "0123456789abcdef";
    for (int i = 0; i < 32; i++) {
        out[i * 2] = hex[digest[i] >> 4];
        out[i * 2 + 1] = hex[digest[i] & 15];
    }
    out[64] = '\0';
}

static void arena_emit_line(const char *json) {
    fputs(json, stdout);
    fputc('\n', stdout);
    fflush(stdout);
}

static int arena_protocol_field(const char *line, const char *field, char *out, size_t out_cap) {
    char key[128];
    snprintf(key, sizeof(key), "\"%s\":", field);
    const char *start = strstr(line, key);
    if (!start) return 0;
    start += strlen(key);
    while (*start == ' ') start++;
    if (*start == '"') {
        start++;
        const char *end = strchr(start, '"');
        if (!end) return 0;
        size_t len = (size_t)(end - start);
        if (len + 1 > out_cap) return 0;
        memcpy(out, start, len);
        out[len] = '\0';
        return 1;
    }
    size_t i = 0;
    while (start[i] && strchr(",} ", start[i]) == NULL && i + 1 < out_cap) {
        out[i] = start[i];
        i++;
    }
    out[i] = '\0';
    return 1;
}

#endif
