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

type Input struct {
	Dimension int   `json:"dimension"`
	Left      []int `json:"left"`
	Right     []int `json:"right"`
}
type Output struct {
	Benchmark    string `json:"benchmark"`
	Version      int    `json:"version"`
	Dimension    int    `json:"dimension"`
	ElementCount int    `json:"elementCount"`
	ValueSum     int64  `json:"valueSum"`
	DiagonalSum  int64  `json:"diagonalSum"`
	Checksum     string `json:"checksum"`
}

func kernel(in Input) Output {
	n := in.Dimension
	a := in.Left
	b := in.Right
	c := make([]int64, n*n)
	var valueSum int64
	var diagonalSum int64
	for i := 0; i < n; i++ {
		for k := 0; k < n; k++ {
			ai := int64(a[i*n+k])
			for j := 0; j < n; j++ {
				c[i*n+j] += ai * int64(b[k*n+j])
			}
		}
		for j := 0; j < n; j++ {
			valueSum += c[i*n+j]
		}
		diagonalSum += c[i*n+i]
	}
	hdr := []byte("dimension=" + strconv.Itoa(n) + "\n")
	bufSize := len(hdr) + n*n*13 + 2
	hashBuf := make([]byte, 0, bufSize)
	hashBuf = append(hashBuf, hdr...)
	for i := 0; i < n*n; i++ {
		hashBuf = strconv.AppendInt(hashBuf, c[i], 10)
		hashBuf = append(hashBuf, ',')
	}
	hashBuf = append(hashBuf, '\n')
	sum := sha256.Sum256(hashBuf)
	return Output{"matrix-multiplication", 1, n, n * n, valueSum, diagonalSum, hex.EncodeToString(sum[:])}
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
			last = kernel(in)
			respond(map[string]any{"type": "result", "requestId": req.RequestId, "digest": outputDigest(last)})
		}
	}
}
