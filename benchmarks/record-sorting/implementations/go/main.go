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
)

type Record struct {
	Id        int64 `json:"id"`
	Score     int64 `json:"score"`
	Timestamp int64 `json:"timestamp"`
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

const radixSize = 65536

var bufA []Record
var bufB []Record
var counts []uint32

func rkey(r Record, sel int) uint64 {
	switch sel {
	case 0:
		return uint64(r.Id) ^ 0x8000000000000000
	case 1:
		return uint64(r.Timestamp) ^ 0x8000000000000000
	default:
		// score descending
		return uint64(r.Score) ^ 0x7fffffffffffffff
	}
}

func radixPass(src, dst []Record, sel, shift int) {
	clear(counts)
	for i := range src {
		counts[(rkey(src[i], sel)>>shift)&0xFFFF]++
	}
	var sum uint32
	for d := range counts {
		c := counts[d]
		counts[d] = sum
		sum += c
	}
	for i := range src {
		dg := (rkey(src[i], sel) >> shift) & 0xFFFF
		dst[counts[dg]] = src[i]
		counts[dg]++
	}
}

// radixSort runs 12 stable LSD passes over (id, timestamp, score-desc) keys.
// Pass 0 reads straight from the pristine input; the result lands in bufB.
func radixSort(input []Record) []Record {
	n := len(input)
	if n == 0 {
		return input
	}
	radixPass(input, bufA[:n], 0, 0)
	for pass := 1; pass < 12; pass++ {
		if pass&1 == 1 {
			radixPass(bufA[:n], bufB[:n], pass>>2, (pass&3)<<4)
		} else {
			radixPass(bufB[:n], bufA[:n], pass>>2, (pass&3)<<4)
		}
	}
	return bufB[:n]
}

func kernel(sorted []Record) Output {
	n := len(sorted)
	take := 10
	if n < take {
		take = n
	}

	first := make([]Record, take)
	copy(first, sorted[:take])

	last := make([]Record, take)
	copy(last, sorted[n-take:])

	h := sha256.New()
	var buf [64]byte
	for _, r := range sorted {
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

	n := len(in.Records)
	bufA = make([]Record, n)
	bufB = make([]Record, n)
	counts = make([]uint32, radixSize)

	respond(map[string]string{"type": "ready", "protocolVersion": "2.0.0"})
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
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
			last = kernel(radixSort(in.Records))
			respond(map[string]any{"type": "result", "requestId": req.RequestId, "digest": outputDigest(last)})
		}
	}
}
