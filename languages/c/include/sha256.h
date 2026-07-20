#ifndef SHA256_H
#define SHA256_H

#include <stdint.h>
#include <stddef.h>
#include <string.h>

typedef struct {
    uint32_t h[8];
    uint8_t  data[64];
    size_t   datalen;
    uint64_t bitlen;
} SHA256;

static void sha256_reset(SHA256 *ctx) {
    ctx->h[0] = 0x6a09e667; ctx->h[1] = 0xbb67ae85;
    ctx->h[2] = 0x3c6ef372; ctx->h[3] = 0xa54ff53a;
    ctx->h[4] = 0x510e527f; ctx->h[5] = 0x9b05688c;
    ctx->h[6] = 0x1f83d9ab; ctx->h[7] = 0x5be0cd19;
    ctx->datalen = 0;
    ctx->bitlen = 0;
}

static void sha256_init(SHA256 *ctx) {
    sha256_reset(ctx);
}

static uint32_t sha256_rotr(uint32_t x, uint32_t n) {
    return (x >> n) | (x << (32 - n));
}

static uint32_t sha256_ch(uint32_t x, uint32_t y, uint32_t z) {
    return (x & y) ^ (~x & z);
}

static uint32_t sha256_maj(uint32_t x, uint32_t y, uint32_t z) {
    return (x & y) ^ (x & z) ^ (y & z);
}

static uint32_t sha256_ep0(uint32_t x) {
    return sha256_rotr(x, 2) ^ sha256_rotr(x, 13) ^ sha256_rotr(x, 22);
}

static uint32_t sha256_ep1(uint32_t x) {
    return sha256_rotr(x, 6) ^ sha256_rotr(x, 11) ^ sha256_rotr(x, 25);
}

static uint32_t sha256_sig0(uint32_t x) {
    return sha256_rotr(x, 7) ^ sha256_rotr(x, 18) ^ (x >> 3);
}

static uint32_t sha256_sig1(uint32_t x) {
    return sha256_rotr(x, 17) ^ sha256_rotr(x, 19) ^ (x >> 10);
}

static void sha256_transform(SHA256 *ctx) {
    static const uint32_t k[64] = {
        0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,
        0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
        0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,
        0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
        0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,
        0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
        0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,
        0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
        0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,
        0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
        0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,
        0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
        0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,
        0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
        0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,
        0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    };
    uint32_t w[64];
    uint32_t a, b, c, d, e, f, g, h, t1, t2;
    int i;

    for (i = 0; i < 16; i++) {
        w[i] = ((uint32_t)ctx->data[i*4] << 24) |
               ((uint32_t)ctx->data[i*4+1] << 16) |
               ((uint32_t)ctx->data[i*4+2] << 8) |
               ((uint32_t)ctx->data[i*4+3]);
    }
    for (i = 16; i < 64; i++) {
        w[i] = sha256_sig1(w[i-2]) + w[i-7] + sha256_sig0(w[i-15]) + w[i-16];
    }

    a = ctx->h[0]; b = ctx->h[1]; c = ctx->h[2]; d = ctx->h[3];
    e = ctx->h[4]; f = ctx->h[5]; g = ctx->h[6]; h = ctx->h[7];

    for (i = 0; i < 64; i++) {
        t1 = h + sha256_ep1(e) + sha256_ch(e, f, g) + k[i] + w[i];
        t2 = sha256_ep0(a) + sha256_maj(a, b, c);
        h = g; g = f; f = e; e = d + t1;
        d = c; c = b; b = a; a = t1 + t2;
    }

    ctx->h[0] += a; ctx->h[1] += b; ctx->h[2] += c; ctx->h[3] += d;
    ctx->h[4] += e; ctx->h[5] += f; ctx->h[6] += g; ctx->h[7] += h;
}

static void sha256_update(SHA256 *ctx, const uint8_t *data, size_t len) {
    size_t i;
    for (i = 0; i < len; i++) {
        ctx->data[ctx->datalen++] = data[i];
        if (ctx->datalen == 64) {
            sha256_transform(ctx);
            ctx->bitlen += 512;
            ctx->datalen = 0;
        }
    }
}

static void sha256_update_str(SHA256 *ctx, const char *str) {
    sha256_update(ctx, (const uint8_t *)str, strlen(str));
}

static void sha256_final(SHA256 *ctx, uint8_t out[32]) {
    size_t i = ctx->datalen;
    ctx->data[i++] = 0x80;
    if (i > 56) {
        while (i < 64) ctx->data[i++] = 0;
        sha256_transform(ctx);
        i = 0;
    }
    while (i < 56) ctx->data[i++] = 0;
    ctx->bitlen += ctx->datalen * 8;
    for (int j = 7; j >= 0; j--) {
        ctx->data[i++] = (uint8_t)((ctx->bitlen >> (j * 8)) & 0xff);
    }
    sha256_transform(ctx);
    for (int j = 0; j < 8; j++) {
        out[j*4]   = (uint8_t)((ctx->h[j] >> 24) & 0xff);
        out[j*4+1] = (uint8_t)((ctx->h[j] >> 16) & 0xff);
        out[j*4+2] = (uint8_t)((ctx->h[j] >> 8) & 0xff);
        out[j*4+3] = (uint8_t)(ctx->h[j] & 0xff);
    }
}

static void sha256_hex(SHA256 *ctx, char out[65]) {
    static const char hexchars[] = "0123456789abcdef";
    uint8_t digest[32];
    sha256_final(ctx, digest);
    for (int i = 0; i < 32; i++) {
        out[i*2]   = hexchars[digest[i] >> 4];
        out[i*2+1] = hexchars[digest[i] & 0xf];
    }
    out[64] = '\0';
}

static void sha256_hex_string(const char *input, size_t len, char out[65]) {
    SHA256 ctx;
    sha256_init(&ctx);
    sha256_update(&ctx, (const uint8_t *)input, len);
    sha256_hex(&ctx, out);
}

#endif /* SHA256_H */
