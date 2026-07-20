#ifndef JSON_H
#define JSON_H

#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>

typedef enum {
    JSON_NULL,
    JSON_BOOL,
    JSON_NUMBER,
    JSON_STRING,
    JSON_ARRAY,
    JSON_OBJECT
} JsonType;

typedef struct JsonValue JsonValue;

typedef struct {
    char *key;
    JsonValue *value;
} JsonMember;

struct JsonValue {
    JsonType type;
    union {
        int bool_val;
        double number_val;
        char *string_val;
        struct { JsonValue *items; size_t count; } array;
        struct { JsonMember *members; size_t count; } object;
    } as;
};

static JsonValue json_null(void) {
    JsonValue v = { JSON_NULL, { .bool_val = 0 } };
    return v;
}

static JsonValue json_bool(int val) {
    JsonValue v = { JSON_BOOL, { .bool_val = val } };
    return v;
}

static JsonValue json_number(double val) {
    JsonValue v = { JSON_NUMBER, { .number_val = val } };
    return v;
}

static JsonValue json_string(const char *str) {
    JsonValue v = { JSON_STRING, { .string_val = strdup(str) } };
    return v;
}

static JsonValue json_array(void) {
    JsonValue v = { JSON_ARRAY, { .array = { NULL, 0 } } };
    return v;
}

static JsonValue json_object(void) {
    JsonValue v = { JSON_OBJECT, { .object = { NULL, 0 } } };
    return v;
}

static void json_free(JsonValue *v) {
    if (!v) return;
    switch (v->type) {
        case JSON_STRING:
            free(v->as.string_val);
            break;
        case JSON_ARRAY:
            for (size_t i = 0; i < v->as.array.count; i++)
                json_free(&v->as.array.items[i]);
            free(v->as.array.items);
            break;
        case JSON_OBJECT:
            for (size_t i = 0; i < v->as.object.count; i++) {
                free(v->as.object.members[i].key);
                json_free(v->as.object.members[i].value);
            }
            free(v->as.object.members);
            break;
        default:
            break;
    }
}

static void json_array_push(JsonValue *arr, JsonValue val) {
    arr->as.array.count++;
    arr->as.array.items = realloc(arr->as.array.items,
                                  arr->as.array.count * sizeof(JsonValue));
    arr->as.array.items[arr->as.array.count - 1] = val;
}

static void json_object_set(JsonValue *obj, const char *key, JsonValue val) {
    obj->as.object.count++;
    obj->as.object.members = realloc(obj->as.object.members,
                                     obj->as.object.count * sizeof(JsonMember));
    JsonMember *m = &obj->as.object.members[obj->as.object.count - 1];
    m->key = strdup(key);
    m->value = malloc(sizeof(JsonValue));
    *m->value = val;
}

static JsonValue *json_object_get(const JsonValue *obj, const char *key) {
    for (size_t i = 0; i < obj->as.object.count; i++) {
        if (strcmp(obj->as.object.members[i].key, key) == 0)
            return obj->as.object.members[i].value;
    }
    return NULL;
}

static JsonValue *json_array_get(const JsonValue *arr, size_t idx) {
    if (idx >= arr->as.array.count) return NULL;
    return &arr->as.array.items[idx];
}

static int json_as_int(const JsonValue *v) {
    return (int)v->as.number_val;
}

static int64_t json_as_int64(const JsonValue *v) {
    return (int64_t)v->as.number_val;
}

static double json_as_double(const JsonValue *v) {
    return v->as.number_val;
}

static const char *json_as_string(const JsonValue *v) {
    return v->as.string_val;
}

/* Forward declaration */
static JsonValue json_parse_value(const char **s);

static void json_skip_ws(const char **s) {
    while (**s == ' ' || **s == '\t' || **s == '\n' || **s == '\r')
        (*s)++;
}

static JsonValue json_parse_string_value(const char **s) {
    (*s)++;
    const char *start = *s;
    size_t cap = 64, len = 0;
    char *buf = malloc(cap);
    while (**s && **s != '"') {
        if (**s == '\\') {
            (*s)++;
            char c;
            switch (**s) {
                case '"':  c = '"'; break;
                case '\\': c = '\\'; break;
                case '/':  c = '/'; break;
                case 'b':  c = '\b'; break;
                case 'f':  c = '\f'; break;
                case 'n':  c = '\n'; break;
                case 'r':  c = '\r'; break;
                case 't':  c = '\t'; break;
                case 'u': {
                    /* Simple 4-hex-digit unicode escape */
                    char hex[5] = {0};
                    for (int i = 0; i < 4 && (*s)[1]; i++) hex[i] = *++(*s);
                    unsigned int cp = (unsigned int)strtoul(hex, NULL, 16);
                    if (cp < 0x80) {
                        c = (char)cp;
                    } else if (cp < 0x800) {
                        if (len + 2 >= cap) { cap *= 2; buf = realloc(buf, cap); }
                        buf[len++] = (char)(0xC0 | (cp >> 6));
                        c = (char)(0x80 | (cp & 0x3F));
                    } else {
                        if (len + 3 >= cap) { cap *= 2; buf = realloc(buf, cap); }
                        buf[len++] = (char)(0xE0 | (cp >> 12));
                        buf[len++] = (char)(0x80 | ((cp >> 6) & 0x3F));
                        c = (char)(0x80 | (cp & 0x3F));
                    }
                    break;
                }
                default:   c = **s; break;
            }
            if (len + 1 >= cap) { cap *= 2; buf = realloc(buf, cap); }
            buf[len++] = c;
        } else {
            if (len + 1 >= cap) { cap *= 2; buf = realloc(buf, cap); }
            buf[len++] = **s;
        }
        (*s)++;
    }
    if (**s == '"') (*s)++;
    buf[len] = '\0';
    JsonValue v = { JSON_STRING, { .string_val = buf } };
    return v;
}

static JsonValue json_parse_number(const char **s) {
    const char *start = *s;
    double val = strtod(start, (char **)s);
    return json_number(val);
}

static JsonValue json_parse_array(const char **s) {
    (*s)++;
    json_skip_ws(s);
    JsonValue arr = json_array();
    if (**s == ']') { (*s)++; return arr; }
    while (1) {
        JsonValue item = json_parse_value(s);
        json_array_push(&arr, item);
        json_skip_ws(s);
        if (**s == ',') { (*s)++; json_skip_ws(s); continue; }
        if (**s == ']') { (*s)++; break; }
        break;
    }
    return arr;
}

static JsonValue json_parse_object(const char **s) {
    (*s)++;
    json_skip_ws(s);
    JsonValue obj = json_object();
    if (**s == '}') { (*s)++; return obj; }
    while (1) {
        json_skip_ws(s);
        if (**s != '"') break;
        JsonValue key = json_parse_string_value(s);
        json_skip_ws(s);
        if (**s == ':') (*s)++;
        json_skip_ws(s);
        JsonValue val = json_parse_value(s);
        json_object_set(&obj, key.as.string_val, val);
        free(key.as.string_val);
        json_skip_ws(s);
        if (**s == ',') { (*s)++; continue; }
        if (**s == '}') { (*s)++; break; }
        break;
    }
    return obj;
}

static JsonValue json_parse_value(const char **s) {
    json_skip_ws(s);
    if (**s == '"') return json_parse_string_value(s);
    if (**s == '{') return json_parse_object(s);
    if (**s == '[') return json_parse_array(s);
    if (**s == 't') { (*s) += 4; return json_bool(1); }
    if (**s == 'f') { (*s) += 5; return json_bool(0); }
    if (**s == 'n') { (*s) += 4; return json_null(); }
    return json_parse_number(s);
}

static JsonValue json_parse(const char *str) {
    const char *s = str;
    return json_parse_value(&s);
}

/* Forward declaration */
static void json_dump_value(const JsonValue *v, char **buf, size_t *len, size_t *cap);

static void json_ensure(char **buf, size_t *len, size_t *cap, size_t needed) {
    while (*len + needed >= *cap) {
        *cap *= 2;
        *buf = realloc(*buf, *cap);
    }
}

static void json_append_str(char **buf, size_t *len, size_t *cap, const char *s) {
    size_t slen = strlen(s);
    json_ensure(buf, len, cap, slen);
    memcpy(*buf + *len, s, slen);
    *len += slen;
}

static void json_append_char(char **buf, size_t *len, size_t *cap, char c) {
    json_ensure(buf, len, cap, 1);
    (*buf)[(*len)++] = c;
}

static void json_dump_string(const char *s, char **buf, size_t *len, size_t *cap) {
    json_append_char(buf, len, cap, '"');
    while (*s) {
        char c = *s++;
        switch (c) {
            case '"':  json_append_str(buf, len, cap, "\\\""); break;
            case '\\': json_append_str(buf, len, cap, "\\\\"); break;
            case '\b': json_append_str(buf, len, cap, "\\b"); break;
            case '\f': json_append_str(buf, len, cap, "\\f"); break;
            case '\n': json_append_str(buf, len, cap, "\\n"); break;
            case '\r': json_append_str(buf, len, cap, "\\r"); break;
            case '\t': json_append_str(buf, len, cap, "\\t"); break;
            default:   json_append_char(buf, len, cap, c); break;
        }
    }
    json_append_char(buf, len, cap, '"');
}

static void json_dump_value(const JsonValue *v, char **buf, size_t *len, size_t *cap) {
    char numbuf[64];
    switch (v->type) {
        case JSON_NULL:
            json_append_str(buf, len, cap, "null");
            break;
        case JSON_BOOL:
            json_append_str(buf, len, cap, v->as.bool_val ? "true" : "false");
            break;
        case JSON_NUMBER: {
            /* Use enough precision for round-trip fidelity */
            snprintf(numbuf, sizeof(numbuf), "%.17g", v->as.number_val);
            json_append_str(buf, len, cap, numbuf);
            break;
        }
        case JSON_STRING:
            json_dump_string(v->as.string_val, buf, len, cap);
            break;
        case JSON_ARRAY:
            json_append_char(buf, len, cap, '[');
            for (size_t i = 0; i < v->as.array.count; i++) {
                if (i > 0) json_append_char(buf, len, cap, ',');
                json_dump_value(&v->as.array.items[i], buf, len, cap);
            }
            json_append_char(buf, len, cap, ']');
            break;
        case JSON_OBJECT:
            json_append_char(buf, len, cap, '{');
            for (size_t i = 0; i < v->as.object.count; i++) {
                if (i > 0) json_append_char(buf, len, cap, ',');
                json_dump_string(v->as.object.members[i].key, buf, len, cap);
                json_append_char(buf, len, cap, ':');
                json_dump_value(v->as.object.members[i].value, buf, len, cap);
            }
            json_append_char(buf, len, cap, '}');
            break;
    }
}

static char *json_dump(const JsonValue *v) {
    size_t cap = 256, len = 0;
    char *buf = malloc(cap);
    json_dump_value(v, &buf, &len, &cap);
    buf[len] = '\0';
    return buf;
}

/* Convenience: create a JSON object with inline key-value pairs */
static JsonValue json_object_with(const char *k1, JsonValue v1) {
    JsonValue obj = json_object();
    json_object_set(&obj, k1, v1);
    return obj;
}

static JsonValue json_object_with2(const char *k1, JsonValue v1,
                                    const char *k2, JsonValue v2) {
    JsonValue obj = json_object();
    json_object_set(&obj, k1, v1);
    json_object_set(&obj, k2, v2);
    return obj;
}

static JsonValue json_object_with3(const char *k1, JsonValue v1,
                                    const char *k2, JsonValue v2,
                                    const char *k3, JsonValue v3) {
    JsonValue obj = json_object();
    json_object_set(&obj, k1, v1);
    json_object_set(&obj, k2, v2);
    json_object_set(&obj, k3, v3);
    return obj;
}

#endif /* JSON_H */
