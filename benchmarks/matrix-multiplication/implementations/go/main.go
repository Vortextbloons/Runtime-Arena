package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"os"
	"strconv"
)

type Input struct {
	Dimension int   `json:"dimension"`
	Left      []int `json:"left"`
	Right     []int `json:"right"`
}
type Output struct {
	Benchmark    string `json:"benchmark"`
	Version      int    `json:"version"`
	Dimension    int    `json:"dimension"`
	ElementCount int    `json:"elementCount"`
	ValueSum     int64  `json:"valueSum"`
	DiagonalSum  int64  `json:"diagonalSum"`
	Checksum     string `json:"checksum"`
}
type Sample struct {
	Iteration int   `json:"iteration"`
	Duration  int64 `json:"kernelTimeNanoseconds"`
}

func kernel(in Input) Output {
	n := in.Dimension
	a := in.Left
	b := in.Right
	c := make([]int64, n*n)
	var valueSum int64
	var diagonalSum int64
	for i := 0; i < n; i++ {
		for j := 0; j < n; j++ {
			var sum int64
			for k := 0; k < n; k++ {
				sum += int64(a[i*n+k]) * int64(b[k*n+j])
			}
			c[i*n+j] = sum
			valueSum += sum
			if i == j {
				diagonalSum += sum
			}
		}
	}
	h := sha256.New()
	h.Write([]byte("dimension=" + strconv.Itoa(n) + "\n"))
	var buf [32]byte
	for i := 0; i < n*n; i++ {
		tmp := strconv.AppendInt(buf[:0], c[i], 10)
		tmp = append(tmp, ',')
		h.Write(tmp)
	}
	h.Write([]byte("\n"))
	return Output{"matrix-multiplication", 1, n, n * n, valueSum, diagonalSum, hex.EncodeToString(h.Sum(nil))}
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
		start := nowNanoseconds()
		out = kernel(in)
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
