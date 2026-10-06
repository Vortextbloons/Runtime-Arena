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

type heapItem struct {
	node int
	dist int64
}

// Flat CSR graph
var gOffsets []int
var gDst []int
var gWgt []int64
var gN int

// Grouped queries
var groupSrc []int
var groupMembers [][]int
var qID []int
var qDstArr []int

var distBuf []int64
var prevBuf []int
var seenBuf []int32
var tmarkBuf []int32
var epoch int32
var tEpoch int32
var pqBuf []heapItem
var resultBuf []Result
var pathBuf []int

func buildAll(n int, edges []Edge, queries []Query) {
	gN = n
	degree := make([]int, n)
	for _, e := range edges {
		degree[e.From]++
	}
	gOffsets = make([]int, n+1)
	for v := 0; v < n; v++ {
		gOffsets[v+1] = gOffsets[v] + degree[v]
	}
	gDst = make([]int, len(edges))
	gWgt = make([]int64, len(edges))
	fill := append([]int(nil), gOffsets[:n]...)
	for _, e := range edges {
		s := fill[e.From]
		fill[e.From] = s + 1
		gDst[s] = e.To
		gWgt[s] = e.Weight
	}

	qn := len(queries)
	qID = make([]int, qn)
	qDstArr = make([]int, qn)
	groupMap := make(map[int][]int, qn)
	var order []int
	for i, q := range queries {
		qID[i] = q.ID
		qDstArr[i] = q.Destination
		if _, ok := groupMap[q.Source]; !ok {
			order = append(order, q.Source)
		}
		groupMap[q.Source] = append(groupMap[q.Source], i)
	}
	groupSrc = order
	groupMembers = make([][]int, len(order))
	for gi, s := range order {
		groupMembers[gi] = groupMap[s]
	}

	distBuf = make([]int64, n)
	prevBuf = make([]int, n)
	seenBuf = make([]int32, n)
	tmarkBuf = make([]int32, n)
	pqBuf = make([]heapItem, 0, n+len(edges))
	resultBuf = make([]Result, 0, qn)
	pathBuf = make([]int, 0, n)
}

func push(h *[]heapItem, x heapItem) {
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

func pop(h *[]heapItem) heapItem {
	n := len(*h)
	(*h)[0], (*h)[n-1] = (*h)[n-1], (*h)[0]
	x := (*h)[n-1]
	*h = (*h)[:n-1]
	if n > 1 {
		lastDist := (*h)[0].dist
		lastNode := (*h)[0].node
		i := 0
		nn := n - 1
		for {
			left := 2*i + 1
			if left >= nn {
				break
			}
			smallest := left
			if right := left + 1; right < nn && (*h)[right].dist < (*h)[left].dist {
				smallest = right
			}
			if (*h)[smallest].dist >= lastDist {
				break
			}
			(*h)[i] = (*h)[smallest]
			i = smallest
		}
		(*h)[i] = heapItem{lastNode, lastDist}
	}
	return x
}

func kernel() []Result {
	d := distBuf
	pr := prevBuf
	seen := seenBuf
	tmark := tmarkBuf
	qn := len(qID)
	if cap(resultBuf) < qn {
		resultBuf = make([]Result, qn)
	}
	rs := resultBuf[:qn]

	for gi, src := range groupSrc {
		members := groupMembers[gi]
		epoch++
		cur := epoch
		tEpoch++
		tc := tEpoch
		rem := 0
		for _, qi := range members {
			dst := qDstArr[qi]
			if dst != src && tmark[dst] != tc {
				tmark[dst] = tc
				rem++
			}
		}
		d[src] = 0
		seen[src] = cur
		pr[src] = -1
		pq := pqBuf[:0]
		push(&pq, heapItem{src, 0})
		for len(pq) > 0 && rem > 0 {
			x := pop(&pq)
			if seen[x.node] != cur || x.dist != d[x.node] {
				continue
			}
			if tmark[x.node] == tc {
				tmark[x.node] = -tc
				rem--
				if rem == 0 {
					break
				}
			}
			base := gOffsets[x.node]
			end := gOffsets[x.node+1]
			xd := x.dist
			for ei := base; ei < end; ei++ {
				to := gDst[ei]
				nd := xd + gWgt[ei]
				if seen[to] != cur || nd < d[to] {
					seen[to] = cur
					d[to] = nd
					pr[to] = x.node
					push(&pq, heapItem{to, nd})
				}
			}
		}
		for _, qi := range members {
			dst := qDstArr[qi]
			if dst == src {
				v := int64(0)
				rs[qi] = Result{qID[qi], &v, []int{src}}
			} else if seen[dst] != cur {
				rs[qi] = Result{qID[qi], nil, []int{}}
			} else {
				v := d[dst]
				pa := pathBuf[:0]
				for x := dst; ; {
					pa = append(pa, x)
					if x == src {
						break
					}
					x = pr[x]
				}
				for i, j := 0, len(pa)-1; i < j; i, j = i+1, j-1 {
					pa[i], pa[j] = pa[j], pa[i]
				}
				cp := make([]int, len(pa))
				copy(cp, pa)
				rs[qi] = Result{qID[qi], &v, cp}
			}
		}
	}
	_ = math.MaxInt64
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
	buildAll(in.N, in.Edges, in.Queries)
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
			last = Output{"shortest-path", 1, kernel()}
			respond(map[string]any{"type": "result", "requestId": req.RequestId, "digest": outputDigest(last)})
		}
	}
}
