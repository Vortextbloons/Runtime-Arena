package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sort"
)

type Entry struct {
	Word  string
	Count int
}

type Output struct {
	Benchmark  string  `json:"benchmark"`
	Version    int     `json:"version"`
	TotalWords int     `json:"totalWords"`
	UniqueWords int    `json:"uniqueWords"`
	TopWords   []Entry `json:"topWords"`
	Checksum   string  `json:"checksum"`
}

type Sample struct {
	Iteration int   `json:"iteration"`
	Duration  int64 `json:"kernelTimeNanoseconds"`
}

func (e Entry) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		Word  string `json:"word"`
		Count int    `json:"count"`
	}{e.Word, e.Count})
}

func kernel(words []string) Output {
	freq := make(map[string]int)
	for _, w := range words {
		freq[w]++
	}

	entries := make([]Entry, 0, len(freq))
	for w, c := range freq {
		entries = append(entries, Entry{w, c})
	}

	sort.Slice(entries, func(i, j int) bool {
		if entries[i].Count != entries[j].Count {
			return entries[i].Count > entries[j].Count
		}
		return entries[i].Word < entries[j].Word
	})

	h := sha256.New()
	for _, e := range entries {
		fmt.Fprintf(h, "%s,%d\n", e.Word, e.Count)
	}

	top := entries
	if len(top) > 10 {
		top = entries[:10]
	}

	return Output{
		Benchmark:   "word-frequency",
		Version:     1,
		TotalWords:  len(words),
		UniqueWords: len(entries),
		TopWords:    top,
		Checksum:    hex.EncodeToString(h.Sum(nil)),
	}
}

func main() {
	ip := flag.String("input", "", "")
	op := flag.String("output", "", "")
	tp := flag.String("timing-output", "", "")
	w := flag.Int("warmup", 0, "")
	n := flag.Int("iterations", 1, "")
	flag.Parse()

	raw, _ := os.ReadFile(*ip)
	var input struct {
		Words []string `json:"words"`
	}
	json.Unmarshal(raw, &input)

	samples := []Sample{}
	var out Output
	for i := -*w; i < *n; i++ {
		start := nowNanoseconds()
		out = kernel(input.Words)
		elapsed := max(int64(1), nowNanoseconds()-start)
		if i >= 0 {
			samples = append(samples, Sample{i + 1, elapsed})
		}
	}

	raw, _ = json.Marshal(out)
	os.WriteFile(*op, raw, 0644)
	raw, _ = json.Marshal(struct {
		Samples []Sample `json:"samples"`
	}{samples})
	os.WriteFile(*tp, raw, 0644)
}
