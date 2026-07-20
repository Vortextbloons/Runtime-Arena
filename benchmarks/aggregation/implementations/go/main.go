package main

import (
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"flag"
	"io"
	"math"
	"os"
	"slices"
	"strconv"
)

type Row struct {
	Account, Category string
	Quantity, Price   int64
}
type Category struct {
	Category string `json:"category"`
	Quantity int64  `json:"quantity"`
	Value    int64  `json:"valueMinorUnits"`
}
type Account struct {
	Account string `json:"accountId"`
	Value   int64  `json:"valueMinorUnits"`
}
type Output struct {
	Benchmark  string     `json:"benchmark"`
	Version    int        `json:"version"`
	Count      int        `json:"recordCount"`
	Quantity   int64      `json:"totalQuantity"`
	Value      int64      `json:"totalValueMinorUnits"`
	Categories []Category `json:"categories"`
	Accounts   []Account  `json:"topAccounts"`
	Min        int64      `json:"minimumTransactionMinorUnits"`
	Max        int64      `json:"maximumTransactionMinorUnits"`
	Checksum   string     `json:"checksum"`
}
type Sample struct {
	Iteration int   `json:"iteration"`
	Duration  int64 `json:"kernelTimeNanoseconds"`
}

func kernel(rows []Row) Output {
	cm := map[string]*[2]int64{}
	am := map[string]*int64{}
	var q, total int64
	min := int64(^uint64(0) >> 1)
	var max int64
	for _, r := range rows {
		v := r.Quantity * r.Price
		q += r.Quantity
		total += v
		if v < min {
			min = v
		}
		if v > max {
			max = v
		}
		x := cm[r.Category]
		if x == nil {
			x = &[2]int64{}
			cm[r.Category] = x
		}
		x[0] += r.Quantity
		x[1] += v
		y := am[r.Account]
		if y == nil {
			y = new(int64)
			am[r.Account] = y
		}
		*y += v
	}
	cats := make([]Category, 0, len(cm))
	for k, v := range cm {
		cats = append(cats, Category{k, v[0], v[1]})
	}
	slices.SortFunc(cats, func(a, b Category) int {
		if a.Category < b.Category {
			return -1
		}
		if a.Category > b.Category {
			return 1
		}
		return 0
	})
	accounts := make([]Account, 0, len(am))
	for k, v := range am {
		accounts = append(accounts, Account{k, *v})
	}
	if len(accounts) > 10 {
		var top10 [10]Account
		n := 0
		for _, a := range accounts {
			if n < 10 {
				top10[n] = a
				n++
				for i := n - 1; i > 0; i-- {
					if top10[i].Value > top10[i-1].Value || (top10[i].Value == top10[i-1].Value && top10[i].Account < top10[i-1].Account) {
						top10[i], top10[i-1] = top10[i-1], top10[i]
					} else {
						break
					}
				}
			} else if a.Value > top10[9].Value || (a.Value == top10[9].Value && a.Account < top10[9].Account) {
				top10[9] = a
				for i := 9; i > 0; i-- {
					if top10[i].Value > top10[i-1].Value || (top10[i].Value == top10[i-1].Value && top10[i].Account < top10[i-1].Account) {
						top10[i], top10[i-1] = top10[i-1], top10[i]
					} else {
						break
					}
				}
			}
		}
		accounts = top10[:n]
	} else {
		slices.SortFunc(accounts, func(a, b Account) int {
			if a.Value != b.Value {
				if a.Value > b.Value {
					return -1
				}
				return 1
			}
			if a.Account < b.Account {
				return -1
			}
			if a.Account > b.Account {
				return 1
			}
			return 0
		})
	}
	var wb []byte
	wb = append(wb, `{"Categories":[`...)
	for i, c := range cats {
		if i > 0 {
			wb = append(wb, ',')
		}
		wb = append(wb, `{"category":"`...)
		wb = append(wb, c.Category...)
		wb = append(wb, `","quantity":`...)
		wb = strconv.AppendInt(wb, c.Quantity, 10)
		wb = append(wb, `,"valueMinorUnits":`...)
		wb = strconv.AppendInt(wb, c.Value, 10)
		wb = append(wb, '}')
	}
	wb = append(wb, `],"TopAccounts":[`...)
	for i, a := range accounts {
		if i > 0 {
			wb = append(wb, ',')
		}
		wb = append(wb, `{"accountId":"`...)
		wb = append(wb, a.Account...)
		wb = append(wb, `","valueMinorUnits":`...)
		wb = strconv.AppendInt(wb, a.Value, 10)
		wb = append(wb, '}')
	}
	wb = append(wb, `]}`...)
	wb = append(wb, '\n')
	sum := sha256.Sum256(wb)
	return Output{"aggregation", 1, len(rows), q, total, cats, accounts, min, max, hex.EncodeToString(sum[:])}
}

func readRows(path string) []Row {
	f, _ := os.Open(path)
	defer f.Close()
	r := csv.NewReader(f)
	r.Read()
	var rows []Row
	for {
		rec, err := r.Read()
		if err != nil {
			if err == io.EOF {
				break
			}
			continue
		}
		if len(rec) < 5 {
			continue
		}
		q, _ := strconv.ParseInt(rec[3], 10, 64)
		p, _ := strconv.ParseInt(rec[4], 10, 64)
		rows = append(rows, Row{rec[1], rec[2], q, p})
	}
	return rows
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
	rows := readRows(*ip)
	samples := []Sample{}
	var out Output
	kernelTimes := []int64{}
	for i := -*w; ; i++ {
		start := nowNanoseconds()
		out = kernel(rows)
		elapsed := max(int64(1), nowNanoseconds()-start)
		if i >= 0 {
			kernelTimes = append(kernelTimes, elapsed)
			samples = append(samples, Sample{len(samples) + 1, elapsed})
			if len(kernelTimes) >= *maxIt || (len(kernelTimes) >= *minIt && ciWidth(kernelTimes) <= *targetCi) {
				break
			}
		}
	}
	raw, _ := json.Marshal(out)
	os.WriteFile(*op, raw, 0644)
	raw, _ = json.Marshal(struct {
		Samples []Sample `json:"samples"`
	}{samples})
	os.WriteFile(*tp, raw, 0644)
}
