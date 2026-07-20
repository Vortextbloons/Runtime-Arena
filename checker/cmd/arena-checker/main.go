package main

import (
	"bufio"
	"bytes"
	"container/heap"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"os"
	"regexp"
	"sort"
	"strconv"
)

const version = "1.0.0"

type response struct {
	Status         string   `json:"status"`
	Benchmark      string   `json:"benchmark"`
	CheckerVersion string   `json:"checkerVersion"`
	Diagnostics    []string `json:"diagnostics"`
}

func finish(status, benchmark string, err error) {
	r := response{status, benchmark, version, []string{}}
	if err != nil {
		r.Diagnostics = []string{err.Error()}
	}
	json.NewEncoder(os.Stdout).Encode(r)
	switch status {
	case "accepted":
		os.Exit(0)
	case "wrong-answer":
		os.Exit(1)
	case "malformed-output":
		os.Exit(2)
	case "unsupported-version":
		os.Exit(3)
	default:
		os.Exit(4)
	}
}
func strictJSON(file string, v any) error {
	data, err := os.ReadFile(file)
	if err != nil {
		return err
	}
	if len(data) > 10*1024*1024 {
		return errors.New("JSON exceeds 10 MiB limit")
	}
	if err = rejectDuplicateKeys(data); err != nil {
		return err
	}
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if err = d.Decode(v); err != nil {
		return err
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return errors.New("trailing JSON content")
	}
	return nil
}

func readInputJSON(file string, v any) error {
	data, err := os.ReadFile(file)
	if err != nil {
		return err
	}
	if err = rejectDuplicateKeys(data); err != nil {
		return err
	}
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if err = d.Decode(v); err != nil {
		return err
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return errors.New("trailing JSON content")
	}
	return nil
}

func rejectDuplicateKeys(data []byte) error {
	d := json.NewDecoder(bytes.NewReader(data))
	var visit func() error
	visit = func() error {
		token, err := d.Token()
		if err != nil {
			return err
		}
		delim, ok := token.(json.Delim)
		if !ok {
			return nil
		}
		switch delim {
		case '{':
			seen := map[string]bool{}
			for d.More() {
				keyToken, err := d.Token()
				if err != nil {
					return err
				}
				key, ok := keyToken.(string)
				if !ok {
					return errors.New("object key is not a string")
				}
				if seen[key] {
					return fmt.Errorf("duplicate JSON field %q", key)
				}
				seen[key] = true
				if err := visit(); err != nil {
					return err
				}
			}
			_, err = d.Token()
			return err
		case '[':
			for d.More() {
				if err := visit(); err != nil {
					return err
				}
			}
			_, err = d.Token()
			return err
		default:
			return errors.New("unexpected JSON delimiter")
		}
	}
	if err := visit(); err != nil {
		return err
	}
	if d.More() {
		return errors.New("trailing JSON content")
	}
	return nil
}

type body struct {
	Mass     float64    `json:"mass"`
	Position [3]float64 `json:"position"`
	Velocity [3]float64 `json:"velocity"`
}
type nbodyInput struct {
	Steps     int     `json:"steps"`
	DeltaTime float64 `json:"deltaTime"`
	Bodies    []body  `json:"bodies"`
}
type nbodyOutput struct {
	Benchmark        string  `json:"benchmark"`
	Version          int     `json:"version"`
	BodyCount        int     `json:"bodyCount"`
	FinalEnergy      float64 `json:"finalEnergy"`
	PositionChecksum string  `json:"positionChecksum"`
	VelocityChecksum string  `json:"velocityChecksum"`
}

func simulate(in nbodyInput) nbodyOutput {
	b := append([]body(nil), in.Bodies...)
	for step := 0; step < in.Steps; step++ {
		for i := 0; i < len(b); i++ {
			for j := i + 1; j < len(b); j++ {
				var d [3]float64
				var r2 float64
				for k := 0; k < 3; k++ {
					d[k] = b[j].Position[k] - b[i].Position[k]
					r2 += d[k] * d[k]
				}
				mag := in.DeltaTime / (r2 * math.Sqrt(r2))
				for k := 0; k < 3; k++ {
					b[i].Velocity[k] += d[k] * b[j].Mass * mag
					b[j].Velocity[k] -= d[k] * b[i].Mass * mag
				}
			}
		}
		for i := range b {
			for k := 0; k < 3; k++ {
				b[i].Position[k] += in.DeltaTime * b[i].Velocity[k]
			}
		}
	}
	var energy float64
	for i := range b {
		var v2 float64
		for k := 0; k < 3; k++ {
			v2 += b[i].Velocity[k] * b[i].Velocity[k]
		}
		energy += .5 * b[i].Mass * v2
		for j := i + 1; j < len(b); j++ {
			var r2 float64
			for k := 0; k < 3; k++ {
				d := b[i].Position[k] - b[j].Position[k]
				r2 += d * d
			}
			energy -= b[i].Mass * b[j].Mass / math.Sqrt(r2)
		}
	}
	pos, vel := sha256.New(), sha256.New()
	for _, x := range b {
		for k := 0; k < 3; k++ {
			fmt.Fprintf(pos, "%.9f,", x.Position[k])
			fmt.Fprintf(vel, "%.9f,", x.Velocity[k])
		}
	}
	return nbodyOutput{"nbody", 1, len(b), energy, hex.EncodeToString(pos.Sum(nil)), hex.EncodeToString(vel.Sum(nil))}
}

type edge struct {
	From   int   `json:"from"`
	To     int   `json:"to"`
	Weight int64 `json:"weight"`
}
type query struct {
	ID          int `json:"id"`
	Source      int `json:"source"`
	Destination int `json:"destination"`
}
type graphInput struct {
	VertexCount int     `json:"vertexCount"`
	Edges       []edge  `json:"edges"`
	Queries     []query `json:"queries"`
}
type pathResult struct {
	QueryID  int    `json:"queryId"`
	Distance *int64 `json:"distance"`
	Path     []int  `json:"path"`
}
type pathOutput struct {
	Benchmark string       `json:"benchmark"`
	Version   int          `json:"version"`
	Results   []pathResult `json:"results"`
}
type item struct {
	node int
	dist int64
}
type pq []item

func (p pq) Len() int           { return len(p) }
func (p pq) Less(i, j int) bool { return p[i].dist < p[j].dist }
func (p pq) Swap(i, j int)      { p[i], p[j] = p[j], p[i] }
func (p *pq) Push(x any)        { *p = append(*p, x.(item)) }
func (p *pq) Pop() any          { o := *p; x := o[len(o)-1]; *p = o[:len(o)-1]; return x }
func shortest(g graphInput, q query) *int64 {
	adj := make([][]edge, g.VertexCount)
	for _, e := range g.Edges {
		if e.From >= 0 && e.From < g.VertexCount {
			adj[e.From] = append(adj[e.From], e)
		}
	}
	const inf = int64(math.MaxInt64)
	d := make([]int64, g.VertexCount)
	for i := range d {
		d[i] = inf
	}
	d[q.Source] = 0
	h := &pq{{q.Source, 0}}
	heap.Init(h)
	for h.Len() > 0 {
		x := heap.Pop(h).(item)
		if x.dist != d[x.node] {
			continue
		}
		if x.node == q.Destination {
			return &x.dist
		}
		for _, e := range adj[x.node] {
			if e.Weight > math.MaxInt64-x.dist {
				continue
			}
			nd := x.dist + e.Weight
			if nd < d[e.To] {
				d[e.To] = nd
				heap.Push(h, item{e.To, nd})
			}
		}
	}
	return nil
}
func validateGraphInput(in graphInput) error {
	if in.VertexCount <= 0 {
		return errors.New("vertexCount must be positive")
	}
	for index, e := range in.Edges {
		if e.From < 0 || e.From >= in.VertexCount || e.To < 0 || e.To >= in.VertexCount {
			return fmt.Errorf("edge %d contains a vertex outside the graph", index)
		}
		if e.Weight < 0 {
			return fmt.Errorf("edge %d has a negative weight", index)
		}
	}
	seenQueries := make(map[int]bool, len(in.Queries))
	for index, q := range in.Queries {
		if q.Source < 0 || q.Source >= in.VertexCount || q.Destination < 0 || q.Destination >= in.VertexCount {
			return fmt.Errorf("query %d contains a vertex outside the graph", index)
		}
		if seenQueries[q.ID] {
			return fmt.Errorf("duplicate query id %d", q.ID)
		}
		seenQueries[q.ID] = true
	}
	return nil
}
func checkPaths(in graphInput, out pathOutput) error {
	if err := validateGraphInput(in); err != nil {
		return fmt.Errorf("invalid shortest-path input: %w", err)
	}
	if out.Benchmark != "shortest-path" || out.Version != 1 || len(out.Results) != len(in.Queries) {
		return errors.New("invalid header or result count")
	}
	edges := map[[2]int]int64{}
	for _, e := range in.Edges {
		edges[[2]int{e.From, e.To}] = e.Weight
	}
	for i, q := range in.Queries {
		r := out.Results[i]
		if r.QueryID != q.ID {
			return fmt.Errorf("query %d id mismatch", q.ID)
		}
		expected := shortest(in, q)
		if expected == nil {
			if r.Distance != nil || len(r.Path) != 0 {
				return fmt.Errorf("query %d should be unreachable", q.ID)
			}
			continue
		}
		if r.Distance == nil || *r.Distance != *expected {
			return fmt.Errorf("query %d is not optimal", q.ID)
		}
		if len(r.Path) == 0 || r.Path[0] != q.Source || r.Path[len(r.Path)-1] != q.Destination {
			return fmt.Errorf("query %d path endpoints invalid", q.ID)
		}
		var cost int64
		for j := 1; j < len(r.Path); j++ {
			w, ok := edges[[2]int{r.Path[j-1], r.Path[j]}]
			if !ok {
				return fmt.Errorf("query %d uses missing edge", q.ID)
			}
			cost += w
		}
		if cost != *r.Distance {
			return fmt.Errorf("query %d path cost mismatch", q.ID)
		}
	}
	return nil
}

type category struct {
	Category        string `json:"category"`
	Quantity        int64  `json:"quantity"`
	ValueMinorUnits int64  `json:"valueMinorUnits"`
}
type account struct {
	AccountID       string `json:"accountId"`
	ValueMinorUnits int64  `json:"valueMinorUnits"`
}
type aggregation struct {
	Benchmark                    string     `json:"benchmark"`
	Version                      int        `json:"version"`
	RecordCount                  int64      `json:"recordCount"`
	TotalQuantity                int64      `json:"totalQuantity"`
	TotalValueMinorUnits         int64      `json:"totalValueMinorUnits"`
	Categories                   []category `json:"categories"`
	TopAccounts                  []account  `json:"topAccounts"`
	MinimumTransactionMinorUnits int64      `json:"minimumTransactionMinorUnits"`
	MaximumTransactionMinorUnits int64      `json:"maximumTransactionMinorUnits"`
	Checksum                     string     `json:"checksum"`
}

type wordFrequencyInput struct {
	Words []string `json:"words"`
}
type wordCount struct {
	Word  string `json:"word"`
	Count int64  `json:"count"`
}
type wordFrequencyOutput struct {
	Benchmark   string      `json:"benchmark"`
	Version     int         `json:"version"`
	TotalWords  int64       `json:"totalWords"`
	UniqueWords int64       `json:"uniqueWords"`
	TopWords    []wordCount `json:"topWords"`
	Checksum    string      `json:"checksum"`
}

type record struct {
	ID        int64 `json:"id"`
	Score     int64 `json:"score"`
	Timestamp int64 `json:"timestamp"`
}
type recordSortingInput struct {
	Records []record `json:"records"`
}
type recordSortingOutput struct {
	Benchmark    string   `json:"benchmark"`
	Version      int      `json:"version"`
	RecordCount  int64    `json:"recordCount"`
	FirstRecords []record `json:"firstRecords"`
	LastRecords  []record `json:"lastRecords"`
	Checksum     string   `json:"checksum"`
}

type matrixMultiplicationInput struct {
	Dimension int     `json:"dimension"`
	Left      []int64 `json:"left"`
	Right     []int64 `json:"right"`
}
type matrixMultiplicationOutput struct {
	Benchmark    string `json:"benchmark"`
	Version      int    `json:"version"`
	Dimension    int    `json:"dimension"`
	ElementCount int64  `json:"elementCount"`
	ValueSum     int64  `json:"valueSum"`
	DiagonalSum  int64  `json:"diagonalSum"`
	Checksum     string `json:"checksum"`
}

type barrierWaveInput struct {
	SchemaVersion  string `json:"schemaVersion"`
	WorkerCount    int    `json:"workerCount"`
	PhaseCount     int    `json:"phaseCount"`
	ItemsPerWorker int    `json:"itemsPerWorker"`
	RoundsPerItem  int    `json:"roundsPerItem"`
	InitialSeed    string `json:"initialSeed"`
}

type barrierWaveOutput struct {
	SchemaVersion  string `json:"schemaVersion"`
	Benchmark      string `json:"benchmark"`
	WorkerCount    int    `json:"workerCount"`
	PhaseCount     int    `json:"phaseCount"`
	ItemsProcessed int64  `json:"itemsProcessed"`
	FinalSeed      string `json:"finalSeed"`
	Digest         string `json:"digest"`
}

var (
	hex32Pattern = regexp.MustCompile(`^[0-9a-f]{8}$`)
	hex64Pattern = regexp.MustCompile(`^[0-9a-f]{16}$`)
)

func mix32(x uint32) uint32 {
	x ^= x >> 16
	x *= 0x21f0aaad
	x ^= x >> 15
	x *= 0x735a2d97
	x ^= x >> 15
	return x
}

func rotateLeft64(x uint64, n uint) uint64 {
	return x<<n | x>>(64-n)
}

func runBarrierWave(in barrierWaveInput) (barrierWaveOutput, error) {
	if in.SchemaVersion != "1.0.0" {
		return barrierWaveOutput{}, fmt.Errorf("unsupported barrier-wave input schema version %q", in.SchemaVersion)
	}
	if in.WorkerCount <= 0 || in.PhaseCount <= 0 || in.ItemsPerWorker <= 0 || in.RoundsPerItem <= 0 {
		return barrierWaveOutput{}, errors.New("barrier-wave counts must be positive")
	}
	if !hex32Pattern.MatchString(in.InitialSeed) {
		return barrierWaveOutput{}, errors.New("initialSeed must be eight lowercase hexadecimal characters")
	}
	seedValue, err := strconv.ParseUint(in.InitialSeed, 16, 32)
	if err != nil {
		return barrierWaveOutput{}, fmt.Errorf("invalid initialSeed: %w", err)
	}
	phaseSeed := uint32(seedValue)
	digest := uint64(0x6a09e667f3bcc909)
	for phase := 0; phase < in.PhaseCount; phase++ {
		nextSeed := phaseSeed ^ uint32(phase)
		var phaseSum uint64
		for workerID := 0; workerID < in.WorkerCount; workerID++ {
			var localXor uint32
			var localSum uint64
			for localItem := 0; localItem < in.ItemsPerWorker; localItem++ {
				globalItem := uint32(workerID*in.ItemsPerWorker + localItem)
				x := phaseSeed ^ globalItem ^ uint32(workerID)*0x9e3779b9
				for round := 0; round < in.RoundsPerItem; round++ {
					x ^= x << 13
					x ^= x >> 17
					x ^= x << 5
					x = x*0x9e3779b1 + 0x85ebca77
				}
				localXor ^= x
				localSum += uint64(x)
			}
			nextSeed = mix32(nextSeed ^ localXor ^ uint32(localSum) ^ uint32(localSum>>32) ^ uint32(workerID))
			phaseSum += localSum
		}
		phaseSeed = nextSeed
		digest = rotateLeft64(digest, 7)
		digest ^= uint64(nextSeed)
		digest += phaseSum
	}
	return barrierWaveOutput{
		SchemaVersion:  "1.0.0",
		Benchmark:      "barrier-wave",
		WorkerCount:    in.WorkerCount,
		PhaseCount:     in.PhaseCount,
		ItemsProcessed: int64(in.WorkerCount) * int64(in.PhaseCount) * int64(in.ItemsPerWorker),
		FinalSeed:      fmt.Sprintf("%08x", phaseSeed),
		Digest:         fmt.Sprintf("%016x", digest),
	}, nil
}

func checkBarrierWave(in barrierWaveInput, out barrierWaveOutput) error {
	if out.SchemaVersion != "1.0.0" {
		return fmt.Errorf("unsupported barrier-wave output schema version %q", out.SchemaVersion)
	}
	if !hex32Pattern.MatchString(out.FinalSeed) || !hex64Pattern.MatchString(out.Digest) {
		return errors.New("finalSeed and digest must be lowercase, zero-padded hexadecimal")
	}
	want, err := runBarrierWave(in)
	if err != nil {
		return err
	}
	if out != want {
		return errors.New("barrier-wave result mismatch")
	}
	return nil
}

func aggregate(file string) (aggregation, error) {
	f, e := os.Open(file)
	if e != nil {
		return aggregation{}, e
	}
	defer f.Close()
	r := csv.NewReader(bufio.NewReader(f))
	header, e := r.Read()
	if e != nil {
		return aggregation{}, e
	}
	wantHeader := []string{"timestamp", "account_id", "category", "quantity", "unit_price"}
	if len(header) != len(wantHeader) {
		return aggregation{}, errors.New("aggregation CSV has an invalid header")
	}
	for index := range wantHeader {
		if header[index] != wantHeader[index] {
			return aggregation{}, errors.New("aggregation CSV has an invalid header")
		}
	}
	cats := map[string]category{}
	acc := map[string]int64{}
	o := aggregation{Benchmark: "aggregation", Version: 1, MinimumTransactionMinorUnits: math.MaxInt64}
	for {
		row, e := r.Read()
		if e == io.EOF {
			break
		}
		if e != nil {
			return o, e
		}
		q, parseErr := strconv.ParseInt(row[3], 10, 64)
		if parseErr != nil {
			return o, fmt.Errorf("record %d has invalid quantity: %w", o.RecordCount+1, parseErr)
		}
		price, parseErr := strconv.ParseInt(row[4], 10, 64)
		if parseErr != nil {
			return o, fmt.Errorf("record %d has invalid unit price: %w", o.RecordCount+1, parseErr)
		}
		v := q * price
		o.RecordCount++
		o.TotalQuantity += q
		o.TotalValueMinorUnits += v
		if v < o.MinimumTransactionMinorUnits {
			o.MinimumTransactionMinorUnits = v
		}
		if v > o.MaximumTransactionMinorUnits {
			o.MaximumTransactionMinorUnits = v
		}
		c := cats[row[2]]
		c.Category = row[2]
		c.Quantity += q
		c.ValueMinorUnits += v
		cats[row[2]] = c
		acc[row[1]] += v
	}
	for _, c := range cats {
		o.Categories = append(o.Categories, c)
	}
	sort.Slice(o.Categories, func(i, j int) bool { return o.Categories[i].Category < o.Categories[j].Category })
	for id, v := range acc {
		o.TopAccounts = append(o.TopAccounts, account{id, v})
	}
	sort.Slice(o.TopAccounts, func(i, j int) bool {
		if o.TopAccounts[i].ValueMinorUnits == o.TopAccounts[j].ValueMinorUnits {
			return o.TopAccounts[i].AccountID < o.TopAccounts[j].AccountID
		}
		return o.TopAccounts[i].ValueMinorUnits > o.TopAccounts[j].ValueMinorUnits
	})
	if len(o.TopAccounts) > 10 {
		o.TopAccounts = o.TopAccounts[:10]
	}
	h := sha256.New()
	json.NewEncoder(h).Encode(struct {
		Categories  []category
		TopAccounts []account
	}{o.Categories, o.TopAccounts})
	o.Checksum = hex.EncodeToString(h.Sum(nil))
	return o, nil
}

func wordFrequency(in wordFrequencyInput) (wordFrequencyOutput, error) {
	if len(in.Words) == 0 {
		return wordFrequencyOutput{}, errors.New("words must not be empty")
	}
	counts := map[string]int64{}
	for _, word := range in.Words {
		if word == "" {
			return wordFrequencyOutput{}, errors.New("words must not contain empty strings")
		}
		counts[word]++
	}
	all := make([]wordCount, 0, len(counts))
	for word, count := range counts {
		all = append(all, wordCount{word, count})
	}
	sort.Slice(all, func(i, j int) bool {
		if all[i].Count == all[j].Count {
			return all[i].Word < all[j].Word
		}
		return all[i].Count > all[j].Count
	})
	h := sha256.New()
	for _, entry := range all {
		fmt.Fprintf(h, "%s,%d\n", entry.Word, entry.Count)
	}
	topCount := min(10, len(all))
	return wordFrequencyOutput{
		Benchmark: "word-frequency", Version: 1, TotalWords: int64(len(in.Words)),
		UniqueWords: int64(len(all)), TopWords: all[:topCount], Checksum: hex.EncodeToString(h.Sum(nil)),
	}, nil
}

func recordLess(a, b record) bool {
	if a.Score != b.Score {
		return a.Score > b.Score
	}
	if a.Timestamp != b.Timestamp {
		return a.Timestamp < b.Timestamp
	}
	return a.ID < b.ID
}

func recordSorting(in recordSortingInput) (recordSortingOutput, error) {
	if len(in.Records) == 0 {
		return recordSortingOutput{}, errors.New("records must not be empty")
	}
	records := append([]record(nil), in.Records...)
	sort.Slice(records, func(i, j int) bool { return recordLess(records[i], records[j]) })
	h := sha256.New()
	for _, entry := range records {
		fmt.Fprintf(h, "%d,%d,%d\n", entry.ID, entry.Score, entry.Timestamp)
	}
	sampleCount := min(10, len(records))
	return recordSortingOutput{
		Benchmark: "record-sorting", Version: 1, RecordCount: int64(len(records)),
		FirstRecords: records[:sampleCount], LastRecords: records[len(records)-sampleCount:],
		Checksum: hex.EncodeToString(h.Sum(nil)),
	}, nil
}

func matrixMultiplication(in matrixMultiplicationInput) (matrixMultiplicationOutput, error) {
	if in.Dimension <= 0 || in.Dimension > 4096 {
		return matrixMultiplicationOutput{}, errors.New("dimension must be between 1 and 4096")
	}
	elementCount := in.Dimension * in.Dimension
	if len(in.Left) != elementCount || len(in.Right) != elementCount {
		return matrixMultiplicationOutput{}, errors.New("matrix lengths must equal dimension squared")
	}
	product := make([]int64, elementCount)
	for i := 0; i < in.Dimension; i++ {
		for j := 0; j < in.Dimension; j++ {
			var value int64
			for k := 0; k < in.Dimension; k++ {
				value += in.Left[i*in.Dimension+k] * in.Right[k*in.Dimension+j]
			}
			product[i*in.Dimension+j] = value
		}
	}
	h := sha256.New()
	fmt.Fprintf(h, "dimension=%d\n", in.Dimension)
	var valueSum, diagonalSum int64
	for index, value := range product {
		valueSum += value
		if index/in.Dimension == index%in.Dimension {
			diagonalSum += value
		}
		fmt.Fprintf(h, "%d,", value)
	}
	fmt.Fprintln(h)
	return matrixMultiplicationOutput{
		Benchmark: "matrix-multiplication", Version: 1, Dimension: in.Dimension,
		ElementCount: int64(elementCount), ValueSum: valueSum, DiagonalSum: diagonalSum,
		Checksum: hex.EncodeToString(h.Sum(nil)),
	}, nil
}

func sameJSON(a, b any) bool {
	encodedA, _ := json.Marshal(a)
	encodedB, _ := json.Marshal(b)
	return bytes.Equal(encodedA, encodedB)
}

func main() {
	if len(os.Args) < 2 || os.Args[1] != "check" {
		fmt.Fprintln(os.Stderr, "usage: arena-checker check --benchmark ID --input FILE --output FILE")
		os.Exit(4)
	}
	fs := flag.NewFlagSet("check", flag.ExitOnError)
	benchmark := fs.String("benchmark", "", "")
	input := fs.String("input", "", "")
	output := fs.String("output", "", "")
	fs.Parse(os.Args[2:])
	var err error
	status := "wrong-answer"
	switch *benchmark {
	case "nbody":
		var in nbodyInput
		var out nbodyOutput
		if err = readInputJSON(*input, &in); err != nil {
			finish("checker-error", *benchmark, fmt.Errorf("invalid input: %w", err))
		}
		if err = strictJSON(*output, &out); err != nil {
			status = "malformed-output"
		} else {
			if out.Version != 1 {
				finish("unsupported-version", *benchmark, fmt.Errorf("unsupported nbody output version %d", out.Version))
			}
			want := simulate(in)
			if out.Benchmark != "nbody" || out.Version != 1 || out.BodyCount != want.BodyCount || math.Abs(out.FinalEnergy-want.FinalEnergy) > 1e-8 || out.PositionChecksum != want.PositionChecksum || out.VelocityChecksum != want.VelocityChecksum {
				err = errors.New("nbody result mismatch")
			}
		}
	case "shortest-path":
		var in graphInput
		var out pathOutput
		if err = readInputJSON(*input, &in); err != nil {
			finish("checker-error", *benchmark, fmt.Errorf("invalid input: %w", err))
		}
		if err = validateGraphInput(in); err != nil {
			finish("checker-error", *benchmark, fmt.Errorf("invalid input: %w", err))
		}
		if err = strictJSON(*output, &out); err != nil {
			status = "malformed-output"
		} else {
			if out.Version != 1 {
				finish("unsupported-version", *benchmark, fmt.Errorf("unsupported shortest-path output version %d", out.Version))
			}
			err = checkPaths(in, out)
		}
	case "aggregation":
		var out aggregation
		var want aggregation
		if err = strictJSON(*output, &out); err != nil {
			status = "malformed-output"
		} else {
			if out.Version != 1 {
				finish("unsupported-version", *benchmark, fmt.Errorf("unsupported aggregation output version %d", out.Version))
			}
			want, err = aggregate(*input)
			if err != nil {
				finish("checker-error", *benchmark, fmt.Errorf("invalid input: %w", err))
			}
		}
		if err == nil {
			a, _ := json.Marshal(out)
			b, _ := json.Marshal(want)
			if string(a) != string(b) {
				err = errors.New("aggregation result mismatch")
			}
		}
	case "word-frequency":
		var in wordFrequencyInput
		var out wordFrequencyOutput
		if err = readInputJSON(*input, &in); err != nil {
			finish("checker-error", *benchmark, fmt.Errorf("invalid input: %w", err))
		}
		if err = strictJSON(*output, &out); err != nil {
			status = "malformed-output"
		} else if out.Version != 1 {
			finish("unsupported-version", *benchmark, fmt.Errorf("unsupported word-frequency output version %d", out.Version))
		} else {
			want, checkErr := wordFrequency(in)
			if checkErr != nil {
				finish("checker-error", *benchmark, fmt.Errorf("invalid input: %w", checkErr))
			}
			if !sameJSON(out, want) {
				err = errors.New("word-frequency result mismatch")
			}
		}
	case "record-sorting":
		var in recordSortingInput
		var out recordSortingOutput
		if err = readInputJSON(*input, &in); err != nil {
			finish("checker-error", *benchmark, fmt.Errorf("invalid input: %w", err))
		}
		if err = strictJSON(*output, &out); err != nil {
			status = "malformed-output"
		} else if out.Version != 1 {
			finish("unsupported-version", *benchmark, fmt.Errorf("unsupported record-sorting output version %d", out.Version))
		} else {
			want, checkErr := recordSorting(in)
			if checkErr != nil {
				finish("checker-error", *benchmark, fmt.Errorf("invalid input: %w", checkErr))
			}
			if !sameJSON(out, want) {
				err = errors.New("record-sorting result mismatch")
			}
		}
	case "matrix-multiplication":
		var in matrixMultiplicationInput
		var out matrixMultiplicationOutput
		if err = readInputJSON(*input, &in); err != nil {
			finish("checker-error", *benchmark, fmt.Errorf("invalid input: %w", err))
		}
		if err = strictJSON(*output, &out); err != nil {
			status = "malformed-output"
		} else if out.Version != 1 {
			finish("unsupported-version", *benchmark, fmt.Errorf("unsupported matrix-multiplication output version %d", out.Version))
		} else {
			want, checkErr := matrixMultiplication(in)
			if checkErr != nil {
				finish("checker-error", *benchmark, fmt.Errorf("invalid input: %w", checkErr))
			}
			if !sameJSON(out, want) {
				err = errors.New("matrix-multiplication result mismatch")
			}
		}
	case "barrier-wave":
		var in barrierWaveInput
		var out barrierWaveOutput
		if err = readInputJSON(*input, &in); err != nil {
			finish("checker-error", *benchmark, fmt.Errorf("invalid input: %w", err))
		}
		if err = strictJSON(*output, &out); err != nil {
			status = "malformed-output"
		} else if out.SchemaVersion != "1.0.0" {
			finish("unsupported-version", *benchmark, fmt.Errorf("unsupported barrier-wave output schema version %q", out.SchemaVersion))
		} else {
			err = checkBarrierWave(in, out)
		}
	default:
		finish("unsupported-version", *benchmark, errors.New("unknown benchmark"))
	}
	if err != nil {
		finish(status, *benchmark, err)
	}
	finish("accepted", *benchmark, nil)
}
