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

func kernel(words []string) Output {
	freq := make(map[string]int, len(words)/2)
	for _, w := range words {
		freq[w]++
	}

	entries := make([]Entry, 0, len(freq))
	for w, c := range freq {
		entries = append(entries, Entry{w, c})
	}

	slices.SortFunc(entries, func(a, b Entry) int {
		if a.Count != b.Count {
			return b.Count - a.Count
		}
		return slices.Compare([]byte(a.Word), []byte(b.Word))
	})

	h := sha256.New()
	var buf [32]byte
	for _, e := range entries {
		tmp := strconv.AppendInt(buf[:0], int64(e.Count), 10)
		wb := make([]byte, 0, len(e.Word)+len(tmp)+2)
		wb = append(wb, e.Word...)
		wb = append(wb, ',')
		wb = append(wb, tmp...)
		wb = append(wb, '\n')
		h.Write(wb)
	}

	top := entries
	if len(top) > 10 {
		top = entries[:10]
	}

	return Output{
		Benchmark:   "word-frequency",
		Version:     1,
		TotalWords:  len(words),
		UniqueWords: len(entries),
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
	flag.String("protocol-version", "2.0.0", "")
	flag.Parse()

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
