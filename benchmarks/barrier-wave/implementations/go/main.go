package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"runtime"
	"strconv"
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

type workerResult struct {
	workerID int
	localXor uint32
	localSum uint64
}

type pool struct {
	workChs     []chan uint32
	resultCh    chan workerResult
	workerCount int
	results     []workerResult
}

func newPool(workerCount, itemsPerWorker, roundsPerItem int) *pool {
	p := &pool{
		workChs:     make([]chan uint32, workerCount),
		resultCh:    make(chan workerResult, workerCount),
		workerCount: workerCount,
		results:     make([]workerResult, workerCount),
	}
	for w := 0; w < workerCount; w++ {
		ch := make(chan uint32, 1)
		p.workChs[w] = ch
		go func(workerID int, workCh <-chan uint32) {
			workerMul := uint32(workerID) * 0x9e3779b9
			for phaseSeed := range workCh {
				localXor := uint32(0)
				localSum := uint64(0)
				for localItem := 0; localItem < itemsPerWorker; localItem++ {
					globalItemId := uint32(workerID*itemsPerWorker + localItem)
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
				p.resultCh <- workerResult{workerID, localXor, localSum}
			}
		}(w, ch)
	}
	return p
}

func (p *pool) close() {
	for _, ch := range p.workChs {
		close(ch)
	}
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

func kernel(in Input, p *pool) Output {
	seedVal, _ := strconv.ParseUint(in.InitialSeed, 16, 32)
	phaseSeed := uint32(seedVal)
	digest := uint64(0x6a09e667f3bcc909)
	results := p.results

	for phase := 0; phase < in.PhaseCount; phase++ {
		for w := 0; w < p.workerCount; w++ {
			p.workChs[w] <- phaseSeed
		}

		for w := 0; w < p.workerCount; w++ {
			r := <-p.resultCh
			results[r.workerID] = r
		}

		nextSeed := phaseSeed ^ uint32(phase)
		var phaseSum uint64
		for w := 0; w < p.workerCount; w++ {
			r := results[w]
			nextSeed = mix32(nextSeed ^ r.localXor ^ uint32(r.localSum) ^ uint32(r.localSum>>32) ^ uint32(r.workerID))
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
		FinalSeed:      fmt.Sprintf("%08x", phaseSeed),
		Digest:         fmt.Sprintf("%016x", digest),
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

	runtime.GOMAXPROCS(in.WorkerCount)
	p := newPool(in.WorkerCount, in.ItemsPerWorker, in.RoundsPerItem)

	samples := []Sample{}
	var out Output
	for i := -*w; i < *n; i++ {
		start := nowNanoseconds()
		out = kernel(in, p)
		elapsed := max(int64(1), nowNanoseconds()-start)
		if i >= 0 {
			samples = append(samples, Sample{i + 1, elapsed})
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
