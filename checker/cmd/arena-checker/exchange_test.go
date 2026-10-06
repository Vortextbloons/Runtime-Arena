package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func exchangeFixture(rows ...[]int64) exchangeInput {
	in := exchangeInput{SchemaVersion: "1.0.0", Instruments: [][]int64{{1, 1, 1000}}, Accounts: []json.RawMessage{
		json.RawMessage(`[1,10000,[[1,100]]]`), json.RawMessage(`[2,10000,[[1,100]]]`), json.RawMessage(`[3,10000,[[1,100]]]`), json.RawMessage(`[4,10000,[[1,100]]]`),
	}}
	for i, row := range rows {
		e := []int64{row[0], int64(i + 1)}
		e = append(e, row[1:]...)
		in.Events = append(in.Events, e)
	}
	in.Events = append(in.Events, []int64{10, int64(len(rows) + 1)})
	return in
}
func exchangeHash(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
func replayExchangeTest(t *testing.T, in exchangeInput) *exchangeState {
	t.Helper()
	s, err := newExchange(in)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range in.Events {
		if _, err := s.event(e); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.finish(); err != nil {
		t.Fatal(err)
	}
	return s
}
func TestExchangeGoldenFIFOAndChecksums(t *testing.T) {
	in := exchangeFixture([]int64{0, 10, 2, 1, 1, 100, 5}, []int64{0, 11, 3, 1, 1, 100, 7}, []int64{0, 12, 1, 1, 0, 110, 8}, []int64{9, 1, 2})
	got, err := runExchange(in)
	if err != nil {
		t.Fatal(err)
	}
	if got.TradeCount != 2 || got.TradedQuantity != 8 || got.TradedValue != 800 || got.OpenOrderCount != 1 || got.AcceptedOrderCount != 3 || got.SnapshotCount != 1 {
		t.Fatalf("wrong counters: %+v", got)
	}
	expect := map[string][2]string{
		"book":      {got.BookChecksum, "1|s|100|11|3|4|2\n"},
		"accounts":  {got.AccountChecksum, "A|1|9200|0\nP|1|1|108|0\nA|2|10500|0\nP|2|1|95|0\nA|3|10300|0\nP|3|1|97|4\nA|4|10000|0\nP|4|1|100|0\n"},
		"trades":    {got.TradeChecksum, "1|1|10|12|2|1|100|5\n2|1|11|12|3|1|100|3\n"},
		"snapshots": {got.SnapshotChecksum, "S|4|1|2|1|1000|0|-|100|100|8|800|2|0|1|1\nL|4|s|100|4|1\n"},
		"events":    {got.EventChecksum, "1|0|1|0|0|1\n2|0|1|0|0|1\n3|0|1|2|8|-1\n4|9|1|0|0|0\n5|10|1|0|0|0\n"},
	}
	for name, pair := range expect {
		if pair[0] != exchangeHash(pair[1]) {
			t.Errorf("%s checksum mismatch", name)
		}
	}
	if got.TopAccounts[0] != (exchangeRanking{1, 800}) || got.TopAccounts[1] != (exchangeRanking{2, 500}) {
		t.Fatal("ranking mismatch")
	}
	again, err := runExchange(in)
	if err != nil || !sameJSON(got, again) {
		t.Fatal("replay is not deterministic")
	}
}
func TestExchangeReservationsPriceImprovementAndWithdrawals(t *testing.T) {
	s := replayExchangeTest(t, exchangeFixture([]int64{0, 1, 2, 1, 1, 90, 5}, []int64{0, 2, 1, 1, 0, 100, 10}, []int64{5, 1, 9051}, []int64{5, 1, 9050}))
	if s.accounts[1].cash != 500 || s.accounts[1].reserved != 500 || s.accounts[1].position(1).total != 105 || s.orders[2].quantity != 5 {
		t.Fatal("price improvement / available cash incorrect")
	}
}
func TestExchangeMarketPreflightAndNoLiquidity(t *testing.T) {
	s := replayExchangeTest(t, exchangeFixture([]int64{1, 1, 1, 1, 0, 100}, []int64{0, 2, 2, 1, 1, 100, 5}, []int64{1, 3, 1, 1, 0, 1000}))
	if s.out.RejectedOrderCount != 1 || s.out.AcceptedOrderCount != 2 || s.out.TradedQuantity != 5 || len(s.orders) != 0 || s.accounts[1].cash != 9500 {
		t.Fatal("market executable-portion risk incorrect")
	}
	s = replayExchangeTest(t, exchangeFixture([]int64{0, 1, 2, 1, 1, 200, 60}, []int64{1, 2, 1, 1, 0, 60}))
	if s.out.TradeCount != 0 || s.out.RejectedOrderCount != 1 || s.orders[1].quantity != 60 {
		t.Fatal("unaffordable market partially executed")
	}
}
func TestExchangeSelfTradeRejectsBeforeAnyFill(t *testing.T) {
	s := replayExchangeTest(t, exchangeFixture([]int64{0, 1, 2, 1, 1, 90, 5}, []int64{0, 2, 1, 1, 1, 100, 5}, []int64{0, 3, 1, 1, 0, 100, 10}))
	if s.out.TradeCount != 0 || s.out.RejectedOrderCount != 1 || len(s.orders) != 2 || s.orders[1].quantity != 5 {
		t.Fatal("self-trade rejection was not atomic")
	}
}
func TestExchangeReplaceRollbackAndPriorityLoss(t *testing.T) {
	s := replayExchangeTest(t, exchangeFixture([]int64{0, 1, 2, 1, 1, 100, 5}, []int64{0, 2, 3, 1, 1, 100, 5}, []int64{3, 2, 1, 100, 101}, []int64{3, 2, 1, 100, 5}, []int64{1, 3, 1, 1, 0, 5}))
	if s.out.RejectedReplaceCount != 1 || s.out.AcceptedReplaceCount != 1 || s.out.CancelledOrderCount != 1 || s.orders[1] == nil || s.orders[1].priority != 4 || s.orders[2] != nil {
		t.Fatal("replacement rollback / priority incorrect")
	}
	if s.accounts[2].position(1).reserved != 5 {
		t.Fatal("replacement reservation leaked")
	}
}
func TestExchangeHaltsBandsAndSettlement(t *testing.T) {
	s := replayExchangeTest(t, exchangeFixture([]int64{0, 1, 1, 1, 0, 50, 10}, []int64{0, 2, 2, 1, 1, 200, 10}, []int64{6, 1}, []int64{6, 1}, []int64{0, 3, 1, 1, 0, 50, 1}, []int64{3, 1, 1, 50, 1}, []int64{8, 1, 60, 150}, []int64{7, 1}, []int64{0, 4, 1, 1, 0, 100, 3}))
	if s.out.CancelledOrderCount != 2 || len(s.orders) != 1 || s.accounts[1].reserved != 300 || s.accounts[2].position(1).reserved != 0 {
		t.Fatal("band cancellation or settlement incorrect")
	}
}
func TestExchangeFundingAndCancelOwnership(t *testing.T) {
	s := replayExchangeTest(t, exchangeFixture([]int64{4, 1, 100}, []int64{0, 1, 1, 1, 0, 100, 5}, []int64{2, 2, 1}, []int64{2, 1, 1}, []int64{5, 1, 10100}))
	if s.accounts[1].cash != 0 || s.accounts[1].reserved != 0 || s.out.CancelledOrderCount != 1 || len(s.orders) != 0 {
		t.Fatal("funding/cancel ownership incorrect")
	}
}

func TestExchangeSellTakerUsesBestBidAndReleasesMakerCash(t *testing.T) {
	s := replayExchangeTest(t, exchangeFixture(
		[]int64{0, 1, 3, 1, 0, 110, 3},
		[]int64{0, 2, 2, 1, 0, 120, 2},
		[]int64{1, 3, 1, 1, 1, 4},
	))
	if s.out.TradeCount != 2 || s.out.TradedValue != 460 || s.orders[2] != nil || s.orders[1].quantity != 1 {
		t.Fatal("sell taker did not consume bids best-first")
	}
	if s.accounts[2].reserved != 0 || s.accounts[3].reserved != 110 || s.accounts[1].cash != 10460 {
		t.Fatal("maker cash reservations not released correctly")
	}
}

func TestExchangeReplacementCanReuseOldCashReservation(t *testing.T) {
	s := replayExchangeTest(t, exchangeFixture(
		[]int64{0, 1, 1, 1, 0, 100, 90},
		[]int64{3, 1, 1, 125, 80},
	))
	if s.out.AcceptedReplaceCount != 1 || s.out.RejectedReplaceCount != 0 || s.accounts[1].reserved != 10000 || s.orders[1].priority != 2 {
		t.Fatal("old reservation was not available to replacement")
	}
}
func TestExchangeRejectsMalformedInput(t *testing.T) {
	for name, change := range map[string]func(*exchangeInput){
		"duplicate instrument": func(in *exchangeInput) { in.Instruments = append(in.Instruments, in.Instruments[0]) },
		"negative cash":        func(in *exchangeInput) { in.Accounts[0] = json.RawMessage(`[1,-1,[]]`) },
		"duplicate position":   func(in *exchangeInput) { in.Accounts[0] = json.RawMessage(`[1,0,[[1,1],[1,2]]]`) },
		"event gap":            func(in *exchangeInput) { in.Events[0][1] = 2 },
		"missing settlement":   func(in *exchangeInput) { in.Events = in.Events[:len(in.Events)-1] },
		"invalid side":         func(in *exchangeInput) { in.Events[0][5] = 2 },
		"reused ID": func(in *exchangeInput) {
			in.Events = [][]int64{{0, 1, 1, 1, 1, 0, 10, 1}, {1, 2, 1, 2, 1, 1, 1}, {10, 3}}
		},
		"safe bound": func(in *exchangeInput) { in.Accounts[0] = json.RawMessage(`[1,9007199254740991,[]]`) },
	} {
		t.Run(name, func(t *testing.T) {
			in := exchangeFixture([]int64{0, 1, 1, 1, 0, 100, 1})
			change(&in)
			if _, err := runExchange(in); err == nil {
				t.Fatal("malformed dataset accepted")
			}
		})
	}
	for _, data := range []string{`{"schemaVersion":"1.0.0","instruments":[[1,1,null]],"accounts":[],"events":[]}`, `{"schemaVersion":"1.0.0","instruments":[],"accounts":[],"events":[],"extra":1}`} {
		var in exchangeInput
		if json.Unmarshal([]byte(data), &in) == nil {
			t.Fatal("null or unknown input field accepted")
		}
	}
}
func TestExchangeStrictOutput(t *testing.T) {
	in := exchangeFixture([]int64{0, 1, 1, 1, 0, 100, 1})
	want, err := runExchange(in)
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(want)
	file := filepath.Join(t.TempDir(), "output.json")
	for name, mutate := range map[string]func(string) string{
		"valid":     func(s string) string { return s },
		"missing":   func(s string) string { return strings.Replace(s, `"rejectedEventCount":0,`, "", 1) },
		"unknown":   func(s string) string { return strings.Replace(s, `"version":1`, `"version":1,"extra":0`, 1) },
		"duplicate": func(s string) string { return strings.Replace(s, `"version":1`, `"version":1,"version":1`, 1) },
		"trailing":  func(s string) string { return s + "{}" },
		"null count": func(s string) string {
			return strings.Replace(s, `"rejectedEventCount":0`, `"rejectedEventCount":null`, 1)
		},
		"wrong digest": func(s string) string { return strings.Replace(s, want.BookChecksum, strings.Repeat("0", 64), 1) },
	} {
		t.Run(name, func(t *testing.T) {
			data := mutate(string(encoded))
			if err := os.WriteFile(file, []byte(data), 0600); err != nil {
				t.Fatal(err)
			}
			var out exchangeOutput
			err := strictJSON(file, &out)
			if err == nil {
				err = checkExchangeOutput(file, want, out)
			}
			if (err == nil) != (name == "valid") {
				t.Fatalf("unexpected validation: %v", err)
			}
		})
	}
}

func TestExchangeCommittedFixtures(t *testing.T) {
	root := filepath.Join("..", "..", "..", "benchmarks", "arena-exchange")
	var manifest struct {
		Sizes map[string]struct {
			Mutations map[string]struct {
				Dataset string `json:"dataset"`
				Seed    int64  `json:"seed"`
			} `json:"mutations"`
		} `json:"sizes"`
	}
	data, err := os.ReadFile(filepath.Join(root, "benchmark.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &manifest); err != nil {
		t.Fatal(err)
	}
	for size, settings := range manifest.Sizes {
		if size != "small" && os.Getenv("ARENA_EXCHANGE_ALL_FIXTURES") != "1" {
			continue
		}
		for profile, entry := range settings.Mutations {
			t.Run(size+"/"+profile, func(t *testing.T) {
				file := filepath.Join(root, "datasets", entry.Dataset)
				bytes, err := os.ReadFile(file)
				if err != nil {
					t.Fatal(err)
				}
				var metadata struct {
					SHA256           string `json:"sha256"`
					Seed             int64  `json:"seed"`
					GeneratorVersion string `json:"generatorVersion"`
				}
				m, err := os.ReadFile(file + ".metadata.json")
				if err != nil {
					t.Fatal(err)
				}
				if json.Unmarshal(m, &metadata) != nil || metadata.SHA256 != exchangeHash(string(bytes)) || metadata.Seed != entry.Seed || metadata.GeneratorVersion != "2.2.0" {
					t.Fatal("fixture metadata mismatch")
				}
				var in exchangeInput
				if err = readInputJSON(file, &in); err != nil {
					t.Fatal(err)
				}
				out, err := runExchange(in)
				if err != nil {
					t.Fatal(err)
				}
				counts := map[string]int{"small": 50000, "medium": 500000, "large": 3000000}
				if len(in.Events) != counts[size] || out.EventCount != int64(counts[size]) {
					t.Fatal("fixture event count mismatch")
				}
				rejection := float64(out.RejectedEventCount) / float64(out.EventCount)
				if rejection < 0.02 || rejection > 0.05 {
					t.Fatalf("rejection ratio %.4f outside 2–5%%", rejection)
				}
				if out.TradeCount == 0 || out.SnapshotCount == 0 || out.AcceptedReplaceCount == 0 || out.CancelledOrderCount == 0 {
					t.Fatal("fixture missing required work")
				}
				t.Logf("events=%d trades=%d rejected=%.2f%% open=%d", out.EventCount, out.TradeCount, rejection*100, out.OpenOrderCount)
				if profile == "crossing-burst" {
					state, err := newExchange(in)
					if err != nil {
						t.Fatal(err)
					}
					orders, crossed := 0, 0
					for _, e := range in.Events {
						before := state.out.TradeCount
						ok, err := state.event(e)
						if err != nil {
							t.Fatal(err)
						}
						if e[0] <= 1 && ok {
							orders++
							if state.out.TradeCount > before {
								crossed++
							}
						}
					}
					ratio := float64(crossed) / float64(orders)
					t.Logf("actual crossing submissions %.2f%%", ratio*100)
					if ratio < 0.8 {
						t.Fatalf("crossing profile only crossed %.2f%% of orders", ratio*100)
					}
				}
			})
		}
	}
}

func TestExchangeWorkedExample(t *testing.T) {
	root := filepath.Join("..", "..", "..", "benchmarks", "arena-exchange", "fixtures")
	var in exchangeInput
	var out exchangeOutput
	if err := readInputJSON(filepath.Join(root, "example.json"), &in); err != nil {
		t.Fatal(err)
	}
	want, err := runExchange(in)
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(root, "example-output.json")
	if err = strictJSON(file, &out); err != nil {
		t.Fatal(err)
	}
	if err = checkExchangeOutput(file, want, out); err != nil {
		t.Fatal(err)
	}
}
