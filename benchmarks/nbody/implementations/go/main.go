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
		b := append([]Body(nil), in.Bodies...)
		start := nowNanoseconds()
		out = kernel(in, b)
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
