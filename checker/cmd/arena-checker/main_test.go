package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNbodySimulationIsDeterministic(t *testing.T) {
	input := nbodyInput{Steps: 10, DeltaTime: 0.01, Bodies: []body{
		{Mass: 1, Position: [3]float64{-1, 0, 0}, Velocity: [3]float64{0, -.25, 0}},
		{Mass: 1, Position: [3]float64{1, 0, 0}, Velocity: [3]float64{0, .25, 0}},
	}}
	first, second := simulate(input), simulate(input)
	if first != second {
		t.Fatal("simulation is not deterministic")
	}
	if first.BodyCount != 2 || first.PositionChecksum == "" || first.VelocityChecksum == "" {
		t.Fatal("simulation returned incomplete output")
	}
}

func TestShortestPathAndAlternateOptimalPath(t *testing.T) {
	graph := graphInput{VertexCount: 4, Edges: []edge{
		{From: 0, To: 1, Weight: 1}, {From: 0, To: 2, Weight: 1},
		{From: 1, To: 3, Weight: 1}, {From: 2, To: 3, Weight: 1},
	}, Queries: []query{{ID: 1, Source: 0, Destination: 3}}}
	distance := int64(2)
	output := pathOutput{Benchmark: "shortest-path", Version: 1, Results: []pathResult{
		{QueryID: 1, Distance: &distance, Path: []int{0, 2, 3}},
	}}
	if err := checkPaths(graph, output); err != nil {
		t.Fatalf("valid alternate path rejected: %v", err)
	}
}

func TestShortestPathRejectsInvalidGraphWithoutPanicking(t *testing.T) {
	graph := graphInput{VertexCount: 2, Edges: []edge{{From: 0, To: 2, Weight: 1}}, Queries: []query{{ID: 1, Source: 0, Destination: 1}}}
	output := pathOutput{Benchmark: "shortest-path", Version: 1, Results: []pathResult{{QueryID: 1}}}
	if err := checkPaths(graph, output); err == nil {
		t.Fatal("out-of-range edge was accepted")
	}

	graph = graphInput{VertexCount: 2, Edges: []edge{{From: 0, To: 1, Weight: -1}}, Queries: []query{{ID: 1, Source: 0, Destination: 1}}}
	if err := checkPaths(graph, output); err == nil {
		t.Fatal("negative edge weight was accepted")
	}
}

func TestAggregation(t *testing.T) {
	file := filepath.Join(t.TempDir(), "input.csv")
	data := "timestamp,account_id,category,quantity,unit_price\n2026-01-01,A,books,2,100\n2026-01-02,B,games,3,50\n"
	if err := os.WriteFile(file, []byte(data), 0600); err != nil {
		t.Fatal(err)
	}
	got, err := aggregate(file)
	if err != nil {
		t.Fatal(err)
	}
	if got.RecordCount != 2 || got.TotalQuantity != 5 || got.TotalValueMinorUnits != 350 {
		t.Fatalf("unexpected aggregate: %+v", got)
	}
}

func TestAggregationRejectsMalformedNumbersAndHeaders(t *testing.T) {
	for name, data := range map[string]string{
		"number": "timestamp,account_id,category,quantity,unit_price\n2026-01-01,A,books,nope,100\n",
		"header": "account_id,timestamp,category,quantity,unit_price\nA,2026-01-01,books,2,100\n",
	} {
		t.Run(name, func(t *testing.T) {
			file := filepath.Join(t.TempDir(), "input.csv")
			if err := os.WriteFile(file, []byte(data), 0600); err != nil {
				t.Fatal(err)
			}
			if _, err := aggregate(file); err == nil {
				t.Fatal("malformed CSV was accepted")
			}
		})
	}
}

func TestWordFrequency(t *testing.T) {
	got, err := wordFrequency(wordFrequencyInput{Words: []string{"beta", "alpha", "beta", "gamma", "alpha", "beta"}})
	if err != nil {
		t.Fatal(err)
	}
	if got.TotalWords != 6 || got.UniqueWords != 3 || got.TopWords[0] != (wordCount{Word: "beta", Count: 3}) {
		t.Fatalf("unexpected word frequency result: %+v", got)
	}
	if got.Checksum == "" {
		t.Fatal("word frequency checksum is empty")
	}
}

func TestRecordSortingTieBreaking(t *testing.T) {
	got, err := recordSorting(recordSortingInput{Records: []record{
		{ID: 3, Score: 5, Timestamp: 10}, {ID: 2, Score: 5, Timestamp: 10},
		{ID: 1, Score: 5, Timestamp: 9}, {ID: 4, Score: 6, Timestamp: 20},
	}})
	if err != nil {
		t.Fatal(err)
	}
	want := []record{{ID: 4, Score: 6, Timestamp: 20}, {ID: 1, Score: 5, Timestamp: 9}, {ID: 2, Score: 5, Timestamp: 10}, {ID: 3, Score: 5, Timestamp: 10}}
	if !sameJSON(got.FirstRecords, want) || !sameJSON(got.LastRecords, want) {
		t.Fatalf("record sort tie-breaking mismatch: %+v", got)
	}
}

func TestMatrixMultiplication(t *testing.T) {
	got, err := matrixMultiplication(matrixMultiplicationInput{Dimension: 2, Left: []int64{1, 2, 3, 4}, Right: []int64{5, 6, 7, 8}})
	if err != nil {
		t.Fatal(err)
	}
	if got.ElementCount != 4 || got.ValueSum != 134 || got.DiagonalSum != 69 || got.Checksum == "" {
		t.Fatalf("unexpected matrix multiplication result: %+v", got)
	}
}

func TestStrictJSONRejectsUnknownFields(t *testing.T) {
	file := filepath.Join(t.TempDir(), "output.json")
	if err := os.WriteFile(file, []byte(`{"benchmark":"nbody","version":1,"bodyCount":1,"finalEnergy":0,"positionChecksum":"x","velocityChecksum":"y","extra":true}`), 0600); err != nil {
		t.Fatal(err)
	}
	var output nbodyOutput
	if err := strictJSON(file, &output); err == nil {
		t.Fatal("unknown field was accepted")
	}
}

func TestStrictJSONRejectsDuplicateFields(t *testing.T) {
	file := filepath.Join(t.TempDir(), "output.json")
	if err := os.WriteFile(file, []byte(`{"benchmark":"nbody","benchmark":"nbody","version":1,"bodyCount":1,"finalEnergy":0,"positionChecksum":"x","velocityChecksum":"y"}`), 0600); err != nil {
		t.Fatal(err)
	}
	var output nbodyOutput
	if err := strictJSON(file, &output); err == nil {
		t.Fatal("duplicate field was accepted")
	}
}

func TestBarrierWaveReference(t *testing.T) {
	in := barrierWaveInput{
		SchemaVersion: "1.0.0", WorkerCount: 2, PhaseCount: 3,
		ItemsPerWorker: 4, RoundsPerItem: 2, InitialSeed: "729418ab",
	}
	got, err := runBarrierWave(in)
	if err != nil {
		t.Fatal(err)
	}
	if got.ItemsProcessed != 24 || got.FinalSeed != "cb9e49cc" || got.Digest != "ccff928c7ada488a" {
		t.Fatalf("unexpected barrier-wave result: %+v", got)
	}
	if err := checkBarrierWave(in, got); err != nil {
		t.Fatalf("valid result rejected: %v", err)
	}
}

func TestBarrierWaveRejectsMalformedHex(t *testing.T) {
	in := barrierWaveInput{
		SchemaVersion: "1.0.0", WorkerCount: 1, PhaseCount: 1,
		ItemsPerWorker: 1, RoundsPerItem: 1, InitialSeed: "729418ab",
	}
	out, err := runBarrierWave(in)
	if err != nil {
		t.Fatal(err)
	}
	out.FinalSeed = "ABCDEF12"
	if err := checkBarrierWave(in, out); err == nil {
		t.Fatal("uppercase hexadecimal output was accepted")
	}
}
