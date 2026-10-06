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

func kernel(words []string) Output {
	/* Reuse pre-allocated map, sized to avoid resizes on mostly-unique inputs */
	if freqBuf == nil {
		freqBuf = make(map[string]int, len(words))
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
	var numbuf [20]byte
	var suffix [22]byte // ',' + up to 20 digits + '\n'
	for _, e := range entryBuf {
		num := strconv.AppendInt(numbuf[:0], int64(e.Count), 10)
		suffix[0] = ','
		copy(suffix[1:], num)
		suffix[1+len(num)] = '\n'
		// Stream straight into the digest: no giant staging buffer.
		h.Write([]byte(e.Word))
		h.Write(suffix[:2+len(num)])
	}

	// Copy the top entries: entryBuf is reused across iterations.
	top := make([]Entry, 0, 10)
	for i := 0; i < len(entryBuf) && i < 10; i++ {
		top = append(top, entryBuf[i])
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
