package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"slices"
	"strconv"
)

type Entry struct {
	Word  string
	Count int
}

type Output struct {
	Benchmark   string  `json:"benchmark"`
	Version     int     `json:"version"`
	TotalWords  int     `json:"totalWords"`
	UniqueWords int     `json:"uniqueWords"`
	TopWords    []Entry `json:"topWords"`
	Checksum    string  `json:"checksum"`
}

func (e Entry) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		Word  string `json:"word"`
		Count int    `json:"count"`
	}{e.Word, e.Count})
}

var freqBuf map[string]int
var entryBuf []Entry
var hashBuf []byte

func kernel(words []string) Output {
	/* Reuse pre-allocated map */
	if freqBuf == nil {
		freqBuf = make(map[string]int, len(words)/2)
	} else {
		for k := range freqBuf {
			delete(freqBuf, k)
		}
	}
	for _, w := range words {
		freqBuf[w]++
	}

	/* Reuse pre-allocated entry slice */
	if cap(entryBuf) < len(freqBuf) {
		entryBuf = make([]Entry, 0, len(freqBuf))
	} else {
		entryBuf = entryBuf[:0]
	}
	for w, c := range freqBuf {
		entryBuf = append(entryBuf, Entry{w, c})
	}

	slices.SortFunc(entryBuf, func(a, b Entry) int {
		if a.Count != b.Count {
			return b.Count - a.Count
		}
		/* Direct string comparison instead of slices.Compare([]byte(...), []byte(...)) */
		if a.Word < b.Word {
			return -1
		}
		if a.Word > b.Word {
			return 1
		}
		return 0
	})

	h := sha256.New()
	var buf [32]byte
	/* Reuse hash buffer */
	bufSize := len(entryBuf) * 64
	if cap(hashBuf) < bufSize {
		hashBuf = make([]byte, 0, bufSize)
	} else {
		hashBuf = hashBuf[:0]
	}
	for _, e := range entryBuf {
		tmp := strconv.AppendInt(buf[:0], int64(e.Count), 10)
		hashBuf = append(hashBuf, e.Word...)
		hashBuf = append(hashBuf, ',')
		hashBuf = append(hashBuf, tmp...)
		hashBuf = append(hashBuf, '\n')
		h.Write(hashBuf[len(hashBuf)-len(e.Word)-len(tmp)-2:])
	}

	top := entryBuf
	if len(top) > 10 {
		top = entryBuf[:10]
	}

	return Output{
		Benchmark:   "word-frequency",
		Version:     1,
		TotalWords:  len(words),
		UniqueWords: len(entryBuf),
		TopWords:    top,
		Checksum:    hex.EncodeToString(h.Sum(nil)),
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
	var input struct {
		Words []string `json:"words"`
	}
	json.Unmarshal(raw, &input)

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
			last = kernel(input.Words)
			respond(map[string]any{"type": "result", "requestId": req.RequestId, "digest": outputDigest(last)})
		}
	}
}
