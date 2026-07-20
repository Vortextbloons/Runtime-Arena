#include "protocol.h"
#include <stdio.h>
#include <string.h>

static void kernel(char *json, size_t cap) {
    snprintf(json, cap, "{\"benchmark\":\"minimal\",\"version\":1,\"value\":42}");
}

int main(int argc, char **argv) {
    const char *version = arena_arg(argc, argv, "--protocol-version");
    if (strcmp(version, ARENA_PROTOCOL_VERSION) != 0) return 1;
    const char *input = arena_arg(argc, argv, "--input");
    const char *output_path = arena_arg(argc, argv, "--output");
    (void)input;

    arena_emit_line("{\"type\":\"ready\",\"protocolVersion\":\"" ARENA_PROTOCOL_VERSION "\"}");

    char line[4096];
    char result[128];
    char digest[65];
    char request_id[32];
    while (fgets(line, sizeof(line), stdin)) {
        char type[32];
        if (!arena_protocol_field(line, "type", type, sizeof(type))) continue;
        if (strcmp(type, "run") == 0) {
            arena_protocol_field(line, "requestId", request_id, sizeof(request_id));
            kernel(result, sizeof(result));
            arena_digest_hex((const unsigned char *)result, strlen(result), digest);
            fprintf(stdout, "{\"type\":\"result\",\"requestId\":%s,\"digest\":\"%s\"}\n", request_id, digest);
            fflush(stdout);
        } else if (strcmp(type, "finish") == 0) {
            kernel(result, sizeof(result));
            arena_digest_hex((const unsigned char *)result, strlen(result), digest);
            FILE *out = fopen(output_path, "wb");
            fwrite(result, 1, strlen(result), out);
            fclose(out);
            fprintf(stdout, "{\"type\":\"finish\",\"digest\":\"%s\"}\n", digest);
            fflush(stdout);
            break;
        }
    }
    return 0;
}
