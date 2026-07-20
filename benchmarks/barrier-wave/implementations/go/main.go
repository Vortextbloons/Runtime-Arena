package main

import (
	"encoding/json"
	"flag"
	"math"
	"os"
	"runtime"
	"strconv"
	"sync"
	"sync/atomic"
)

type Input struct {
	SchemaVersion  string `json:"schemaVersion"`
	WorkerCount    int    `json:"workerCount"`
	PhaseCount     int    `json:"phaseCount"`
	ItemsPerWorker int    `json:"itemsPerWorker"`
	RoundsPerItem  int    `json:"roundsPerItem"`
	InitialSeed    string `json:"initialSeed"`
}

type Output struct {
	SchemaVersion  string `json:"schemaVersion"`
	Benchmark      string `json:"benchmark"`
	WorkerCount    int    `json:"workerCount"`
	PhaseCount     int    `json:"phaseCount"`
	ItemsProcessed int64  `json:"itemsProcessed"`
	FinalSeed      string `json:"finalSeed"`
	Digest         string `json:"digest"`
}

type Sample struct {
	Iteration int   `json:"iteration"`
	Duration  int64 `json:"kernelTimeNanoseconds"`
}

type pool struct {
	workerCount    int
	itemsPerWorker int
	roundsPerItem  int
	seed           atomic.Uint32
	results        []workerResult
	start          []atomic.Uint32
	done           []atomic.Uint32
	wg             sync.WaitGroup
}

type workerResult struct {
	localXor uint32
	localSum uint64
}

func newPool(workerCount, itemsPerWorker, roundsPerItem int) *pool {
	p := &pool{
		workerCount:    workerCount,
		itemsPerWorker: itemsPerWorker,
		roundsPerItem:  roundsPerItem,
		results:        make([]workerResult, workerCount),
		start:          make([]atomic.Uint32, workerCount),
		done:           make([]atomic.Uint32, workerCount),
	}
	p.wg.Add(workerCount)
	for w := 0; w < workerCount; w++ {
		go p.worker(w)
	}
	return p
}

func (p *pool) worker(id int) {
	defer p.wg.Done()
	workerMul := uint32(id) * 0x9e3779b9
	itemsPerWorker := p.itemsPerWorker
	roundsPerItem := p.roundsPerItem
	var phaseGen uint32
	for {
		for {
			cur := p.start[id].Load()
			if cur != phaseGen {
				phaseGen = cur
				break
			}
			runtime.Gosched()
		}
		if phaseGen == ^uint32(0) {
			return
		}
		phaseSeed := p.seed.Load()
		localXor := uint32(0)
		localSum := uint64(0)
		for localItem := 0; localItem < itemsPerWorker; localItem++ {
			globalItemId := uint32(id*itemsPerWorker + localItem)
			x := phaseSeed ^ globalItemId ^ workerMul
			for round := 0; round < roundsPerItem; round++ {
				x ^= x << 13
				x ^= x >> 17
				x ^= x << 5
				x = x*0x9e3779b1 + 0x85ebca77
			}
			localXor ^= x
			localSum += uint64(x)
		}
		p.results[id] = workerResult{localXor, localSum}
		p.done[id].Store(phaseGen)
	}
}

func (p *pool) run(seed uint32) {
	p.seed.Store(seed)
	for w := 0; w < p.workerCount; w++ {
		p.start[w].Add(1)
	}
	for w := 0; w < p.workerCount; w++ {
		for p.done[w].Load() != p.start[w].Load() {
			runtime.Gosched()
		}
	}
}

func (p *pool) close() {
	for w := 0; w < p.workerCount; w++ {
		p.start[w].Store(^uint32(0))
	}
	p.wg.Wait()
}

func mix32(x uint32) uint32 {
	x ^= x >> 16
	x *= 0x21f0aaad
	x ^= x >> 15
	x *= 0x735a2d97
	x ^= x >> 15
	return x
}

func rotateLeft64(x uint64, n uint) uint64 {
	return x<<n | x>>(64-n)
}

var hexDigits = "0123456789abcdef"

func formatHex8(v uint32) string {
	var b [8]byte
	for i := 7; i >= 0; i-- {
		b[i] = hexDigits[v&0xf]
		v >>= 4
	}
	return string(b[:])
}

func formatHex16(v uint64) string {
	var b [16]byte
	for i := 15; i >= 0; i-- {
		b[i] = hexDigits[v&0xf]
		v >>= 4
	}
	return string(b[:])
}

func kernel(in Input, p *pool, phaseSeed uint32) Output {
	digest := uint64(0x6a09e667f3bcc909)

	for phase := 0; phase < in.PhaseCount; phase++ {
		p.run(phaseSeed)

		nextSeed := phaseSeed ^ uint32(phase)
		var phaseSum uint64
		for w := 0; w < p.workerCount; w++ {
			r := p.results[w]
			nextSeed = mix32(nextSeed ^ r.localXor ^ uint32(r.localSum) ^ uint32(r.localSum>>32) ^ uint32(w))
			phaseSum += r.localSum
		}

		phaseSeed = nextSeed
		digest = rotateLeft64(digest, 7)
		digest ^= uint64(nextSeed)
		digest += phaseSum
	}

	return Output{
		SchemaVersion:  "1.0.0",
		Benchmark:      "barrier-wave",
		WorkerCount:    in.WorkerCount,
		PhaseCount:     in.PhaseCount,
		ItemsProcessed: int64(in.WorkerCount) * int64(in.PhaseCount) * int64(in.ItemsPerWorker),
		FinalSeed:      formatHex8(phaseSeed),
		Digest:         formatHex16(digest),
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

	runtime.GOMAXPROCS(in.WorkerCount)
	p := newPool(in.WorkerCount, in.ItemsPerWorker, in.RoundsPerItem)
	seedVal, _ := strconv.ParseUint(in.InitialSeed, 16, 32)
	phaseSeed := uint32(seedVal)

	samples := []Sample{}
	var out Output
	kernelTimes := []int64{}
	for i := -*w; ; i++ {
		start := nowNanoseconds()
		out = kernel(in, p, phaseSeed)
		elapsed := max(int64(1), nowNanoseconds()-start)
		if i >= 0 {
			kernelTimes = append(kernelTimes, elapsed)
			samples = append(samples, Sample{len(samples) + 1, elapsed})
			if len(kernelTimes) >= *maxIt || (len(kernelTimes) >= *minIt && ciWidth(kernelTimes) <= *targetCi) {
				break
			}
		}
	}

	p.close()

	raw, _ = json.Marshal(out)
	os.WriteFile(*op, raw, 0644)
	raw, _ = json.Marshal(struct {
		Samples []Sample `json:"samples"`
	}{samples})
	os.WriteFile(*tp, raw, 0644)
}
