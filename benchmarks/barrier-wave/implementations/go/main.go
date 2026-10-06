package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
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

// barrier is a reusable N-party barrier: one broadcast wakes all waiters.
type barrier struct {
	mu      sync.Mutex
	cond    sync.Cond
	parties int
	count   int
	cycle   int
}

func newBarrier(parties int) *barrier {
	b := &barrier{parties: parties}
	b.cond.L = &b.mu
	return b
}

func (b *barrier) wait() {
	b.mu.Lock()
	gen := b.cycle
	b.count++
	if b.count == b.parties {
		b.count = 0
		b.cycle++
		b.mu.Unlock()
		b.cond.Broadcast()
		return
	}
	for gen == b.cycle {
		b.cond.Wait()
	}
	b.mu.Unlock()
}

// slot is one cache line (64B): seed written by the coordinator, results by
// the owning worker. Barriers provide the happens-before edges.
type slot struct {
	seed uint32
	xor  uint32
	sum  uint64
	_    [48]byte
}

type pool struct {
	workerCount    int
	itemsPerWorker int
	roundsPerItem  int
	slots          []slot
	dispatch       *barrier
	complete       *barrier
	stopping       atomic.Bool
	wg             sync.WaitGroup
}

func newPool(workerCount, itemsPerWorker, roundsPerItem int) *pool {
	p := &pool{
		workerCount:    workerCount,
		itemsPerWorker: itemsPerWorker,
		roundsPerItem:  roundsPerItem,
		slots:          make([]slot, workerCount),
		dispatch:       newBarrier(workerCount + 1),
		complete:       newBarrier(workerCount + 1),
	}
	for w := 0; w < workerCount; w++ {
		p.wg.Add(1)
		go p.worker(w)
	}
	return p
}

func (p *pool) worker(id int) {
	defer p.wg.Done()
	workerMul := uint32(id) * 0x9e3779b9
	base := uint32(id * p.itemsPerWorker)
	items := p.itemsPerWorker
	rounds := p.roundsPerItem
	n4 := items &^ 3
	for {
		p.dispatch.wait()
		if p.stopping.Load() {
			break
		}
		phaseSeed := p.slots[id].seed
		var xor0, xor1, xor2, xor3 uint32
		var sum0, sum1, sum2, sum3 uint64
		item := 0
		for ; item < n4; item += 4 {
			b := base + uint32(item)
			x0 := phaseSeed ^ b ^ workerMul
			x1 := phaseSeed ^ (b + 1) ^ workerMul
			x2 := phaseSeed ^ (b + 2) ^ workerMul
			x3 := phaseSeed ^ (b + 3) ^ workerMul
			for r := 0; r < rounds; r++ {
				x0 ^= x0 << 13
				x0 ^= x0 >> 17
				x0 ^= x0 << 5
				x0 = x0*0x9e3779b1 + 0x85ebca77
				x1 ^= x1 << 13
				x1 ^= x1 >> 17
				x1 ^= x1 << 5
				x1 = x1*0x9e3779b1 + 0x85ebca77
				x2 ^= x2 << 13
				x2 ^= x2 >> 17
				x2 ^= x2 << 5
				x2 = x2*0x9e3779b1 + 0x85ebca77
				x3 ^= x3 << 13
				x3 ^= x3 >> 17
				x3 ^= x3 << 5
				x3 = x3*0x9e3779b1 + 0x85ebca77
			}
			xor0 ^= x0
			sum0 += uint64(x0)
			xor1 ^= x1
			sum1 += uint64(x1)
			xor2 ^= x2
			sum2 += uint64(x2)
			xor3 ^= x3
			sum3 += uint64(x3)
		}
		var xorT uint32
		var sumT uint64
		for ; item < items; item++ {
			x := phaseSeed ^ (base + uint32(item)) ^ workerMul
			for r := 0; r < rounds; r++ {
				x ^= x << 13
				x ^= x >> 17
				x ^= x << 5
				x = x*0x9e3779b1 + 0x85ebca77
			}
			xorT ^= x
			sumT += uint64(x)
		}
		p.slots[id].xor = xor0 ^ xor1 ^ xor2 ^ xor3 ^ xorT
		p.slots[id].sum = sum0 + sum1 + sum2 + sum3 + sumT
		p.complete.wait()
	}
	// Coordinator waits in complete after the stop dispatch.
	p.complete.wait()
}

func (p *pool) run(seed uint32) {
	for w := 0; w < p.workerCount; w++ {
		p.slots[w].seed = seed
	}
	p.dispatch.wait()
	p.complete.wait()
}

func (p *pool) close() {
	p.stopping.Store(true)
	p.dispatch.wait()
	p.complete.wait()
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
			s := p.slots[w]
			nextSeed = mix32(nextSeed ^ s.xor ^ uint32(s.sum) ^ uint32(s.sum>>32) ^ uint32(w))
			phaseSum += s.sum
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
	pv := flag.String("protocol-version", "2.0.0", "")
	flag.Parse()
	if *pv != "2.0.0" {
		fmt.Fprintf(os.Stderr, "unsupported protocol version\n")
		os.Exit(1)
	}

	raw, _ := os.ReadFile(*ip)
	var in Input
	json.Unmarshal(raw, &in)

	// Deliberately no GOMAXPROCS clamp: the runtime schedules workers across
	// all CPUs and the barrier keeps exactly workerCount of them in flight.
	p := newPool(in.WorkerCount, in.ItemsPerWorker, in.RoundsPerItem)
	defer p.close()
	seedVal, _ := strconv.ParseUint(in.InitialSeed, 16, 32)
	phaseSeed := uint32(seedVal)

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
			last = kernel(in, p, phaseSeed)
			respond(map[string]any{"type": "result", "requestId": req.RequestId, "digest": outputDigest(last)})
		}
	}
}
