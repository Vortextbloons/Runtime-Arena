package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"math"
	"os"
	"strconv"
)

type Body struct {
	Mass float64    `json:"mass"`
	P    [3]float64 `json:"position"`
	V    [3]float64 `json:"velocity"`
}
type Input struct {
	Steps  int     `json:"steps"`
	Dt     float64 `json:"deltaTime"`
	Bodies []Body  `json:"bodies"`
}
type Output struct {
	Benchmark string  `json:"benchmark"`
	Version   int     `json:"version"`
	Count     int     `json:"bodyCount"`
	Energy    float64 `json:"finalEnergy"`
	P         string  `json:"positionChecksum"`
	V         string  `json:"velocityChecksum"`
}
type Sample struct {
	Iteration int   `json:"iteration"`
	Duration  int64 `json:"kernelTimeNanoseconds"`
}

func kernel(in Input, b []Body) Output {
	for s := 0; s < in.Steps; s++ {
		for i := 0; i < len(b); i++ {
			for j := i + 1; j < len(b); j++ {
				var d [3]float64
				var r float64
				for k := 0; k < 3; k++ {
					d[k] = b[j].P[k] - b[i].P[k]
					r += d[k] * d[k]
				}
				m := in.Dt / (r * math.Sqrt(r))
				for k := 0; k < 3; k++ {
					b[i].V[k] += d[k] * b[j].Mass * m
					b[j].V[k] -= d[k] * b[i].Mass * m
				}
			}
		}
		for i := range b {
			for k := 0; k < 3; k++ {
				b[i].P[k] += in.Dt * b[i].V[k]
			}
		}
	}
	var e float64
	ph, vh := sha256.New(), sha256.New()
	var buf [64]byte
	for i := range b {
		var v float64
		for k := 0; k < 3; k++ {
			v += b[i].V[k] * b[i].V[k]
			tmp := strconv.AppendFloat(buf[:0], b[i].P[k], 'f', 9, 64)
			tmp = append(tmp, ',')
			ph.Write(tmp)
			tmp = strconv.AppendFloat(buf[:0], b[i].V[k], 'f', 9, 64)
			tmp = append(tmp, ',')
			vh.Write(tmp)
		}
		e += .5 * b[i].Mass * v
		for j := i + 1; j < len(b); j++ {
			var r float64
			for k := 0; k < 3; k++ {
				d := b[i].P[k] - b[j].P[k]
				r += d * d
			}
			e -= b[i].Mass * b[j].Mass / math.Sqrt(r)
		}
	}
	return Output{"nbody", 1, len(b), e, hex.EncodeToString(ph.Sum(nil)), hex.EncodeToString(vh.Sum(nil))}
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
		b := append([]Body(nil), in.Bodies...)
		start := nowNanoseconds()
		out = kernel(in, b)
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
