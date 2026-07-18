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
