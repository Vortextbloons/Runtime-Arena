#ifndef ARENA_SORT_H
#define ARENA_SORT_H

/*
 * Type-specific insertion sort for small arrays.
 * Insertion sort is cache-friendly and avoids qsort's function-pointer overhead.
 * For the array sizes in these benchmarks (typically < 1000 elements),
 * insertion sort is often faster than qsort due to better locality.
 */

/* Insertion sort macro - generates a static function for a specific type */
#define INSERTION_SORT(NAME, TYPE, LESS_THAN)                                \
static void NAME(TYPE *a, int n) {                                          \
    for (int i = 1; i < n; i++) {                                           \
        TYPE tmp = a[i];                                                    \
        int j = i - 1;                                                      \
        while (j >= 0 && (LESS_THAN)) {                                     \
            a[j + 1] = a[j];                                                \
            j--;                                                            \
        }                                                                   \
        a[j + 1] = tmp;                                                     \
    }                                                                       \
}

#endif /* ARENA_SORT_H */
