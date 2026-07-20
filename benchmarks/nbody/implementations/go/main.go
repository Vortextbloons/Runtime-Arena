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

type Input struct {
	Steps  int     `json:"steps"`
	Dt     float64 `json:"deltaTime"`
	Bodies []Body  `json:"bodies"`
}
type Body struct {
	Mass float64    `json:"mass"`
	P    [3]float64 `json:"position"`
	V    [3]float64 `json:"velocity"`
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

type sim struct {
	n    int
	mass []float64
	px   []float64
	py   []float64
	pz   []float64
	vx   []float64
	vy   []float64
	vz   []float64
}

func newSim(bodies []Body) *sim {
	n := len(bodies)
	s := &sim{
		n:    n,
		mass: make([]float64, n),
		px:   make([]float64, n),
		py:   make([]float64, n),
		pz:   make([]float64, n),
		vx:   make([]float64, n),
		vy:   make([]float64, n),
		vz:   make([]float64, n),
	}
	for i, b := range bodies {
		s.mass[i] = b.Mass
		s.px[i] = b.P[0]
		s.py[i] = b.P[1]
		s.pz[i] = b.P[2]
		s.vx[i] = b.V[0]
		s.vy[i] = b.V[1]
		s.vz[i] = b.V[2]
	}
	return s
}

func (s *sim) step(dt float64) {
	n := s.n
	for i := 0; i < n; i++ {
		pxi, pyi, pzi := s.px[i], s.py[i], s.pz[i]
		vxi, vyi, vzi := s.vx[i], s.vy[i], s.vz[i]
		mi := s.mass[i]
		for j := i + 1; j < n; j++ {
			dx := s.px[j] - pxi
			dy := s.py[j] - pyi
			dz := s.pz[j] - pzi
			r2 := dx*dx + dy*dy + dz*dz
			invR := 1.0 / math.Sqrt(r2)
			invR3 := invR * invR * invR
			f := dt * invR3
			fmi := f * mi
			fmj := f * s.mass[j]
			vxi += dx * fmj
			vyi += dy * fmj
			vzi += dz * fmj
			s.vx[j] -= dx * fmi
			s.vy[j] -= dy * fmi
			s.vz[j] -= dz * fmi
		}
		s.vx[i] = vxi
		s.vy[i] = vyi
		s.vz[i] = vzi
	}
	for i := 0; i < n; i++ {
		s.px[i] += dt * s.vx[i]
		s.py[i] += dt * s.vy[i]
		s.pz[i] += dt * s.vz[i]
	}
}

func kernel(in Input, s *sim) Output {
	dt := in.Dt
	for i := 0; i < in.Steps; i++ {
		s.step(dt)
	}
	var e float64
	n := s.n
	ph, vh := sha256.New(), sha256.New()
	var buf [64]byte
	for i := 0; i < n; i++ {
		v2 := s.vx[i]*s.vx[i] + s.vy[i]*s.vy[i] + s.vz[i]*s.vz[i]
		e += 0.5 * s.mass[i] * v2
		tmp := strconv.AppendFloat(buf[:0], s.px[i], 'f', 9, 64)
		tmp = append(tmp, ',')
		ph.Write(tmp)
		tmp = strconv.AppendFloat(buf[:0], s.py[i], 'f', 9, 64)
		tmp = append(tmp, ',')
		ph.Write(tmp)
		tmp = strconv.AppendFloat(buf[:0], s.pz[i], 'f', 9, 64)
		tmp = append(tmp, ',')
		ph.Write(tmp)
		tmp = strconv.AppendFloat(buf[:0], s.vx[i], 'f', 9, 64)
		tmp = append(tmp, ',')
		vh.Write(tmp)
		tmp = strconv.AppendFloat(buf[:0], s.vy[i], 'f', 9, 64)
		tmp = append(tmp, ',')
		vh.Write(tmp)
		tmp = strconv.AppendFloat(buf[:0], s.vz[i], 'f', 9, 64)
		tmp = append(tmp, ',')
		vh.Write(tmp)
	}
	for i := 0; i < n; i++ {
		for j := i + 1; j < n; j++ {
			dx := s.px[i] - s.px[j]
			dy := s.py[i] - s.py[j]
			dz := s.pz[i] - s.pz[j]
			r := math.Sqrt(dx*dx + dy*dy + dz*dz)
			e -= s.mass[i] * s.mass[j] / r
		}
	}
	return Output{"nbody", 1, n, e, hex.EncodeToString(ph.Sum(nil)), hex.EncodeToString(vh.Sum(nil))}
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
	s := newSim(in.Bodies)
	for i := -*w; ; i++ {
		s2 := newSim(in.Bodies)
		start := nowNanoseconds()
		out = kernel(in, s2)
		elapsed := max(int64(1), nowNanoseconds()-start)
		if i >= 0 {
			kernelTimes = append(kernelTimes, elapsed)
			samples = append(samples, Sample{len(samples) + 1, elapsed})
			if len(kernelTimes) >= *maxIt || (len(kernelTimes) >= *minIt && ciWidth(kernelTimes) <= *targetCi) {
				break
			}
		}
		_ = s
	}
	raw, _ = json.Marshal(out)
	os.WriteFile(*op, raw, 0644)
	raw, _ = json.Marshal(struct {
		Samples []Sample `json:"samples"`
	}{samples})
	os.WriteFile(*tp, raw, 0644)
}
