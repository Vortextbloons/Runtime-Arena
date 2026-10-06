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

var productBuf []int64
var transBuf []int64
var hashBuf []byte

func ensureSize(n int) {
	size := n * n
	if cap(productBuf) < size {
		productBuf = make([]int64, size)
	} else {
		productBuf = productBuf[:size]
	}
	if cap(transBuf) < size {
		transBuf = make([]int64, size)
	} else {
		transBuf = transBuf[:size]
	}
}

func kernel(in Input) Output {
	n := in.Dimension
	a := in.Left
	b := in.Right

	/* Reuse pre-allocated scratch buffers (fully recomputed each run). */
	ensureSize(n)
	c := productBuf
	bt := transBuf

	/* Blocked transpose of B so the cubic loop streams sequentially. */
	for ii := 0; ii < n; ii += 32 {
		iMax := ii + 32
		if iMax > n {
			iMax = n
		}
		for jj := 0; jj < n; jj += 32 {
			jMax := jj + 32
			if jMax > n {
				jMax = n
			}
			for i := ii; i < iMax; i++ {
				base := i * n
				for j := jj; j < jMax; j++ {
					bt[j*n+i] = int64(b[base+j])
				}
			}
		}
	}

	/* Row/row dot products with 4-way unrolled accumulator parallelism. */
	var valueSum int64
	var diagonalSum int64
	kLim := n &^ 3
	for i := 0; i < n; i++ {
		aBase := i * n
		cBase := i * n
		var rowSum int64
		for j := 0; j < n; j++ {
			bBase := j * n
			var s0, s1, s2, s3 int64
			for k := 0; k < kLim; k += 4 {
				s0 += int64(a[aBase+k]) * bt[bBase+k]
				s1 += int64(a[aBase+k+1]) * bt[bBase+k+1]
				s2 += int64(a[aBase+k+2]) * bt[bBase+k+2]
				s3 += int64(a[aBase+k+3]) * bt[bBase+k+3]
			}
			s := (s0 + s1) + (s2 + s3)
			for k := kLim; k < n; k++ {
				s += int64(a[aBase+k]) * bt[bBase+k]
			}
			c[cBase+j] = s
			rowSum += s
			if i == j {
				diagonalSum += s
			}
		}
		valueSum += rowSum
	}
	
	/* Reuse hash buffer */
	hdr := []byte("dimension=" + strconv.Itoa(n) + "\n")
	bufSize := len(hdr) + n*n*13 + 2
	if cap(hashBuf) < bufSize {
		hashBuf = make([]byte, 0, bufSize)
	} else {
		hashBuf = hashBuf[:0]
	}
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
			last = kernel(in)
			respond(map[string]any{"type": "result", "requestId": req.RequestId, "digest": outputDigest(last)})
		}
	}
}
