package main

import (
	"encoding/json"
	"flag"
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
type Sample struct {
	Iteration int   `json:"iteration"`
	Duration  int64 `json:"kernelTimeNanoseconds"`
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

func kernel(adj [][]Edge, queries []Query) []Result {
	n := len(adj)
	d := make([]int64, n)
	pr := make([]int, n)
	for i := range d {
		d[i] = math.MaxInt64
		pr[i] = -1
	}
	visited := make([]int, 0, n)
	rs := make([]Result, 0, len(queries))
	var pq minHeap
	for _, q := range queries {
		d[q.Source] = 0
		visited = append(visited[:0], q.Source)
		pq = append(pq[:0], heapItem{q.Source, 0})
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

var tCritical = [...]float64{0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045}

func ciWidth(samples []int64) float64 {
	n := len(samples)
	if n < 2 {
		return math.Inf(1)
	}
	var sum float64
	for _, value := range samples {
		sum += float64(value)
	}
	mean := sum / float64(n)
	if mean <= 0 {
		return math.Inf(1)
	}
	var variance float64
	for _, value := range samples {
		delta := float64(value) - mean
		variance += delta * delta
	}
	variance /= float64(n - 1)
	t := 2.0
	if n < len(tCritical) {
		t = tCritical[n]
	}
	return (2 * t * math.Sqrt(variance/float64(n))) / mean
}

func main() {
	ip := flag.String("input", "", "")
	op := flag.String("output", "", "")
	tp := flag.String("timing-output", "", "")
	w := flag.Int("warmup", 0, "")
	minIt := flag.Int("min-iterations", 1, "")
	maxIt := flag.Int("max-iterations", 1, "")
	targetCi := flag.Float64("target-relative-ci", 0.05, "")
	flag.Parse()
	raw, _ := os.ReadFile(*ip)
	var in Input
	json.Unmarshal(raw, &in)
	adj := buildAdjacency(in.N, in.Edges)
	samples := []Sample{}
	var results []Result
	kernelTimes := []int64{}
	for i := -*w; ; i++ {
		start := nowNanoseconds()
		results = kernel(adj, in.Queries)
		elapsed := max(int64(1), nowNanoseconds()-start)
		if i >= 0 {
			kernelTimes = append(kernelTimes, elapsed)
			samples = append(samples, Sample{len(samples) + 1, elapsed})
			if len(kernelTimes) >= *maxIt || (len(kernelTimes) >= *minIt && ciWidth(kernelTimes) <= *targetCi) {
				break
			}
		}
	}
	raw, _ = json.Marshal(struct {
		Benchmark string   `json:"benchmark"`
		Version   int      `json:"version"`
		Results   []Result `json:"results"`
	}{"shortest-path", 1, results})
	os.WriteFile(*op, raw, 0644)
	raw, _ = json.Marshal(struct {
		Samples []Sample `json:"samples"`
	}{samples})
	os.WriteFile(*tp, raw, 0644)
}
