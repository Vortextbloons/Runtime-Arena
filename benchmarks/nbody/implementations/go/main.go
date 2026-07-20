package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
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

func kernel(dt float64, steps int, mass, px, py, pz, vx, vy, vz []float64) (float64, string, string) {
	n := len(mass)
	for i := 0; i < steps; i++ {
		for i := 0; i < n; i++ {
			pxi, pyi, pzi := px[i], py[i], pz[i]
			vxi, vyi, vzi := vx[i], vy[i], vz[i]
			mi := mass[i]
			for j := i + 1; j < n; j++ {
				dx := px[j] - pxi
				dy := py[j] - pyi
				dz := pz[j] - pzi
				r2 := dx*dx + dy*dy + dz*dz
				invR := 1.0 / math.Sqrt(r2)
				invR3 := invR * invR * invR
				f := dt * invR3
				fmi := f * mi
				fmj := f * mass[j]
				vxi += dx * fmj
				vyi += dy * fmj
				vzi += dz * fmj
				vx[j] -= dx * fmi
				vy[j] -= dy * fmi
				vz[j] -= dz * fmi
			}
			vx[i] = vxi
			vy[i] = vyi
			vz[i] = vzi
		}
		for i := 0; i < n; i++ {
			px[i] += dt * vx[i]
			py[i] += dt * vy[i]
			pz[i] += dt * vz[i]
		}
	}
	var e float64
	for i := 0; i < n; i++ {
		v2 := vx[i]*vx[i] + vy[i]*vy[i] + vz[i]*vz[i]
		e += 0.5 * mass[i] * v2
		for j := i + 1; j < n; j++ {
			dx := px[i] - px[j]
			dy := py[i] - py[j]
			dz := pz[i] - pz[j]
			r := math.Sqrt(dx*dx + dy*dy + dz*dz)
			e -= mass[i] * mass[j] / r
		}
	}
	bufSize := n * 3 * 16
	pBuf := make([]byte, 0, bufSize)
	vBuf := make([]byte, 0, bufSize)
	for i := 0; i < n; i++ {
		pBuf = strconv.AppendFloat(pBuf, px[i], 'f', 9, 64)
		pBuf = append(pBuf, ',')
		pBuf = strconv.AppendFloat(pBuf, py[i], 'f', 9, 64)
		pBuf = append(pBuf, ',')
		pBuf = strconv.AppendFloat(pBuf, pz[i], 'f', 9, 64)
		pBuf = append(pBuf, ',')
		vBuf = strconv.AppendFloat(vBuf, vx[i], 'f', 9, 64)
		vBuf = append(vBuf, ',')
		vBuf = strconv.AppendFloat(vBuf, vy[i], 'f', 9, 64)
		vBuf = append(vBuf, ',')
		vBuf = strconv.AppendFloat(vBuf, vz[i], 'f', 9, 64)
		vBuf = append(vBuf, ',')
	}
	pHash := sha256.Sum256(pBuf)
	vHash := sha256.Sum256(vBuf)
	return e, hex.EncodeToString(pHash[:]), hex.EncodeToString(vHash[:])
}

func outputDigest(v any) string {
	raw, _ := json.Marshal(v)
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

func respond(v any) {
	raw, _ := json.Marshal(v)
	fmt.Println(string(raw))
}

func main() {
	ip := flag.String("input", "", "")
	op := flag.String("output", "", "")
	flag.String("protocol-version", "2.0.0", "")
	flag.Parse()
	raw, _ := os.ReadFile(*ip)
	var in Input
	json.Unmarshal(raw, &in)
	n := len(in.Bodies)
	mass := make([]float64, n)
	ipx := make([]float64, n)
	ipy := make([]float64, n)
	ipz := make([]float64, n)
	ivx := make([]float64, n)
	ivy := make([]float64, n)
	ivz := make([]float64, n)
	for i, b := range in.Bodies {
		mass[i] = b.Mass
		ipx[i] = b.P[0]
		ipy[i] = b.P[1]
		ipz[i] = b.P[2]
		ivx[i] = b.V[0]
		ivy[i] = b.V[1]
		ivz[i] = b.V[2]
	}
	px := make([]float64, n)
	py := make([]float64, n)
	pz := make([]float64, n)
	vx := make([]float64, n)
	vy := make([]float64, n)
	vz := make([]float64, n)
	respond(map[string]string{"type": "ready", "protocolVersion": "2.0.0"})
	scanner := bufio.NewScanner(os.Stdin)
	var last Output
	for scanner.Scan() {
		var req struct {
			Type      string `json:"type"`
			RequestId int    `json:"requestId"`
		}
		json.Unmarshal(scanner.Bytes(), &req)
		if req.Type == "finish" {
			raw, _ := json.Marshal(last)
			os.WriteFile(*op, raw, 0644)
			respond(map[string]string{"type": "finish", "digest": outputDigest(last)})
			return
		}
		if req.Type == "run" {
			copy(px, ipx)
			copy(py, ipy)
			copy(pz, ipz)
			copy(vx, ivx)
			copy(vy, ivy)
			copy(vz, ivz)
			e, pH, vH := kernel(in.Dt, in.Steps, mass, px, py, pz, vx, vy, vz)
			last = Output{"nbody", 1, n, e, pH, vH}
			respond(map[string]any{"type": "result", "requestId": req.RequestId, "digest": outputDigest(last)})
		}
	}
}
