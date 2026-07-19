package main

import (
	"container/heap"
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
type Item struct {
	n int
	d int64
}
type PQ []Item

func (p PQ) Len() int           { return len(p) }
func (p PQ) Less(i, j int) bool { return p[i].d < p[j].d }
func (p PQ) Swap(i, j int)      { p[i], p[j] = p[j], p[i] }
func (p *PQ) Push(x any)        { *p = append(*p, x.(Item)) }
func (p *PQ) Pop() any          { o := *p; x := o[len(o)-1]; *p = o[:len(o)-1]; return x }

type Sample struct {
	Iteration int   `json:"iteration"`
	Duration  int64 `json:"kernelTimeNanoseconds"`
}

func kernel(g Input) []Result {
	a := make([][]Edge, g.N)
	for _, e := range g.Edges {
		a[e.From] = append(a[e.From], e)
	}
	rs := []Result{}
	for _, q := range g.Queries {
		d := make([]int64, g.N)
		pr := make([]int, g.N)
		for i := range d {
			d[i] = math.MaxInt64
			pr[i] = -1
		}
		d[q.Source] = 0
		p := &PQ{{q.Source, 0}}
		heap.Init(p)
		for p.Len() > 0 {
			x := heap.Pop(p).(Item)
			if x.d != d[x.n] {
				continue
			}
			for _, e := range a[x.n] {
				nd := x.d + e.Weight
				if nd < d[e.To] {
					d[e.To] = nd
					pr[e.To] = x.n
					heap.Push(p, Item{e.To, nd})
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
	}
	return rs
}
func main() {
	ip := flag.String("input", "", "")
	op := flag.String("output", "", "")
	tp := flag.String("timing-output", "", "")
	w := flag.Int("warmup", 0, "")
	n := flag.Int("iterations", 1, "")
	flag.Parse()
	raw, _ := os.ReadFile(*ip)
	var g Input
	json.Unmarshal(raw, &g)
	samples := []Sample{}
	var results []Result
	for i := -*w; i < *n; i++ {
		start := nowNanoseconds()
		results = kernel(g)
		elapsed := max(int64(1), nowNanoseconds()-start)
		if i >= 0 {
			samples = append(samples, Sample{i + 1, elapsed})
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
