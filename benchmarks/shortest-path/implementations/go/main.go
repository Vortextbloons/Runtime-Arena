package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"os"
)

type Edge struct {
	From, To int
	Weight   int64
}
type Query struct{ ID, Source, Destination int }
type Input struct {
	N       int     `json:"vertexCount"`
	Edges   []Edge  `json:"edges"`
	Queries []Query `json:"queries"`
}
type Result struct {
	ID       int    `json:"queryId"`
	Distance *int64 `json:"distance"`
	Path     []int  `json:"path"`
}
type Output struct {
	Benchmark string   `json:"benchmark"`
	Version   int      `json:"version"`
	Results   []Result `json:"results"`
}

type minHeap []heapItem

type heapItem struct {
	node int
	dist int64
}

func (h *minHeap) push(x heapItem) {
	*h = append(*h, x)
	i := len(*h) - 1
	for i > 0 {
		p := (i - 1) >> 1
		if (*h)[p].dist <= (*h)[i].dist {
			break
		}
		(*h)[p], (*h)[i] = (*h)[i], (*h)[p]
		i = p
	}
}

func (h *minHeap) pop() heapItem {
	n := len(*h)
	(*h)[0], (*h)[n-1] = (*h)[n-1], (*h)[0]
	x := (*h)[n-1]
	*h = (*h)[:n-1]
	if n > 1 {
		i := 0
		for {
			left := 2*i + 1
			if left >= n-1 {
				break
			}
			smallest := left
			if right := left + 1; right < n-1 && (*h)[right].dist < (*h)[left].dist {
				smallest = right
			}
			if (*h)[i].dist <= (*h)[smallest].dist {
				break
			}
			(*h)[i], (*h)[smallest] = (*h)[smallest], (*h)[i]
			i = smallest
		}
	}
	return x
}

func buildAdjacency(n int, edges []Edge) [][]Edge {
	a := make([][]Edge, n)
	for _, e := range edges {
		a[e.From] = append(a[e.From], e)
	}
	return a
}

var distBuf []int64
var prevBuf []int
var visitedBuf []int
var pqBuf []heapItem
var resultBuf []Result

func kernel(adj [][]Edge, queries []Query) []Result {
	n := len(adj)
	
	/* Reuse pre-allocated buffers */
	if cap(distBuf) < n {
		distBuf = make([]int64, n)
		prevBuf = make([]int, n)
		visitedBuf = make([]int, 0, n)
	} else {
		distBuf = distBuf[:n]
		prevBuf = prevBuf[:n]
		visitedBuf = visitedBuf[:0]
	}
	d := distBuf
	pr := prevBuf
	visited := visitedBuf
	
	for i := range d {
		d[i] = math.MaxInt64
		pr[i] = -1
	}
	
	/* Reuse heap buffer */
	if cap(pqBuf) < n {
		pqBuf = make([]heapItem, 0, n)
	}
	
	/* Reuse result buffer */
	if cap(resultBuf) < len(queries) {
		resultBuf = make([]Result, 0, len(queries))
	} else {
		resultBuf = resultBuf[:0]
	}
	rs := resultBuf
	
	for _, q := range queries {
		d[q.Source] = 0
		visited = append(visited[:0], q.Source)
		pq := minHeap(pqBuf[:0])
		pq.push(heapItem{q.Source, 0})
		for len(pq) > 0 {
			x := pq.pop()
			if x.dist != d[x.node] {
				continue
			}
			if x.node == q.Destination {
				break
			}
			for _, e := range adj[x.node] {
				nd := x.dist + e.Weight
				if nd < d[e.To] {
					if d[e.To] == math.MaxInt64 {
						visited = append(visited, e.To)
					}
					d[e.To] = nd
					pr[e.To] = x.node
					pq.push(heapItem{e.To, nd})
				}
			}
		}
		if d[q.Destination] == math.MaxInt64 {
			rs = append(rs, Result{q.ID, nil, []int{}})
		} else {
			pa := []int{}
			for x := q.Destination; x >= 0; x = pr[x] {
				pa = append(pa, x)
			}
			for i, j := 0, len(pa)-1; i < j; i, j = i+1, j-1 {
				pa[i], pa[j] = pa[j], pa[i]
			}
			v := d[q.Destination]
			rs = append(rs, Result{q.ID, &v, pa})
		}
		for _, v := range visited {
			d[v] = math.MaxInt64
			pr[v] = -1
		}
	}
	return rs
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
	adj := buildAdjacency(in.N, in.Edges)
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
			last = Output{"shortest-path", 1, kernel(adj, in.Queries)}
			respond(map[string]any{"type": "result", "requestId": req.RequestId, "digest": outputDigest(last)})
		}
	}
}
