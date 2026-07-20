package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"math"
	"os"
	"slices"
	"strconv"
)

type Record struct {
	Id        int `json:"id"`
	Score     int `json:"score"`
	Timestamp int `json:"timestamp"`
}

type Input struct {
	Records []Record `json:"records"`
}

type Output struct {
	Benchmark    string   `json:"benchmark"`
	Version      int      `json:"version"`
	RecordCount  int      `json:"recordCount"`
	FirstRecords []Record `json:"firstRecords"`
	LastRecords  []Record `json:"lastRecords"`
	Checksum     string   `json:"checksum"`
}

type Sample struct {
	Iteration int   `json:"iteration"`
	Duration  int64 `json:"kernelTimeNanoseconds"`
}

func kernel(records []Record) Output {
	slices.SortFunc(records, func(a, b Record) int {
		if a.Score != b.Score {
			return b.Score - a.Score
		}
		if a.Timestamp != b.Timestamp {
			return a.Timestamp - b.Timestamp
		}
		return a.Id - b.Id
	})

	n := len(records)
	take := 10
	if n < take {
		take = n
	}

	first := make([]Record, take)
	copy(first, records[:take])

	last := make([]Record, take)
	copy(last, records[n-take:])

	h := sha256.New()
	var buf [64]byte
	for _, r := range records {
		tmp := strconv.AppendInt(buf[:0], int64(r.Id), 10)
		tmp = append(tmp, ',')
		tmp = strconv.AppendInt(tmp, int64(r.Score), 10)
		tmp = append(tmp, ',')
		tmp = strconv.AppendInt(tmp, int64(r.Timestamp), 10)
		tmp = append(tmp, '\n')
		h.Write(tmp)
	}

	return Output{
		Benchmark:    "record-sorting",
		Version:      1,
		RecordCount:  n,
		FirstRecords: first,
		LastRecords:  last,
		Checksum:     hex.EncodeToString(h.Sum(nil)),
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
	var in Input
	json.Unmarshal(raw, &in)

	samples := []Sample{}
	var out Output

	kernelTimes := []int64{}
	for i := -*w; ; i++ {
		records := append([]Record(nil), in.Records...)
		start := nowNanoseconds()
		out = kernel(records)
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
