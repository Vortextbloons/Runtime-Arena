package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sort"

	"math")

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

var tCritical = [...]float64{0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045}

func ciWidth(samples []int64) float64 {
	n := len(samples)
	if n < 2 {
		return math.Inf(1)
	}
	var sum float64
	for _, value := range samples {
		sum += float64(value)
	}
	mean := sum / float64(n)
	if mean <= 0 {
		return math.Inf(1)
	}
	var variance float64
	for _, value := range samples {
		delta := float64(value) - mean
		variance += delta * delta
	}
	variance /= float64(n - 1)
	t := 2.0
	if n < len(tCritical) {
		t = tCritical[n]
	}
	return (2 * t * math.Sqrt(variance/float64(n))) / mean
}

func main() {
	ip := flag.String("input", "", "")
	op := flag.String("output", "", "")
	tp := flag.String("timing-output", "", "")
	w := flag.Int("warmup", 0, "")
	minIt := flag.Int("min-iterations", 1, "")
	maxIt := flag.Int("max-iterations", 1, "")
	targetCi := flag.Float64("target-relative-ci", 0.05, "")
	flag.Parse()

	raw, _ := os.ReadFile(*ip)
	var input struct {
		Words []string `json:"words"`
	}
	json.Unmarshal(raw, &input)

	samples := []Sample{}
	var out Output
	kernelTimes := []int64{}
	for i := -*w; ; i++ {
		start := nowNanoseconds()
		out = kernel(input.Words)
		elapsed := max(int64(1), nowNanoseconds()-start)
		if i >= 0 {
			kernelTimes = append(kernelTimes, elapsed)
			samples = append(samples, Sample{len(samples) + 1, elapsed})
			if len(kernelTimes) >= *maxIt || (len(kernelTimes) >= *minIt && ciWidth(kernelTimes) <= *targetCi) {
				break
			}
		}
	}

	raw, _ = json.Marshal(out)
	os.WriteFile(*op, raw, 0644)
	raw, _ = json.Marshal(struct {
		Samples []Sample `json:"samples"`
	}{samples})
	os.WriteFile(*tp, raw, 0644)
}
