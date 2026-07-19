package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
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

func main() {
	ip := flag.String("input", "", "")
	op := flag.String("output", "", "")
	tp := flag.String("timing-output", "", "")
	w := flag.Int("warmup", 0, "")
	n := flag.Int("iterations", 1, "")
	flag.Parse()

	raw, _ := os.ReadFile(*ip)
	var in Input
	json.Unmarshal(raw, &in)

	samples := []Sample{}
	var out Output

	for i := -*w; i < *n; i++ {
		records := append([]Record(nil), in.Records...)
		start := nowNanoseconds()
		out = kernel(records)
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
