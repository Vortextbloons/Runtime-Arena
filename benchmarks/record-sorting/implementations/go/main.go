package main

import (
	"bufio"
	"cmp"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"slices"
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

var recordBuf []Record

func kernel(records []Record) Output {
	/* Reuse pre-allocated buffer */
	if cap(recordBuf) < len(records) {
		recordBuf = make([]Record, len(records))
	} else {
		recordBuf = recordBuf[:len(records)]
	}
	copy(recordBuf, records)
	records = recordBuf
	
	slices.SortFunc(records, func(a, b Record) int {
		if c := cmp.Compare(b.Score, a.Score); c != 0 {
			return c
		}
		if c := cmp.Compare(a.Timestamp, b.Timestamp); c != 0 {
			return c
		}
		return cmp.Compare(a.Id, b.Id)
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
			last = kernel(in.Records)
			respond(map[string]any{"type": "result", "requestId": req.RequestId, "digest": outputDigest(last)})
		}
	}
}
