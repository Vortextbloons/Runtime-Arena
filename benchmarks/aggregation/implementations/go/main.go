package main

import (
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"flag"
	"os"
	"sort"
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
	cm := map[string][2]int64{}
	am := map[string]int64{}
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
		x[0] += r.Quantity
		x[1] += v
		cm[r.Category] = x
		am[r.Account] += v
	}
	cats := []Category{}
	for k, v := range cm {
		cats = append(cats, Category{k, v[0], v[1]})
	}
	sort.Slice(cats, func(i, j int) bool { return cats[i].Category < cats[j].Category })
	accounts := []Account{}
	for k, v := range am {
		accounts = append(accounts, Account{k, v})
	}
	sort.Slice(accounts, func(i, j int) bool {
		return accounts[i].Value > accounts[j].Value || accounts[i].Value == accounts[j].Value && accounts[i].Account < accounts[j].Account
	})
	if len(accounts) > 10 {
		accounts = accounts[:10]
	}
	encoded, _ := json.Marshal(struct {
		Categories  []Category
		TopAccounts []Account
	}{cats, accounts})
	encoded = append(encoded, '\n')
	sum := sha256.Sum256(encoded)
	return Output{"aggregation", 1, len(rows), q, total, cats, accounts, min, max, hex.EncodeToString(sum[:])}
}
func main() {
	ip := flag.String("input", "", "")
	op := flag.String("output", "", "")
	tp := flag.String("timing-output", "", "")
	w := flag.Int("warmup", 0, "")
	n := flag.Int("iterations", 1, "")
	flag.Parse()
	f, _ := os.Open(*ip)
	records, _ := csv.NewReader(f).ReadAll()
	rows := []Row{}
	for _, r := range records[1:] {
		q, _ := strconv.ParseInt(r[3], 10, 64)
		p, _ := strconv.ParseInt(r[4], 10, 64)
		rows = append(rows, Row{r[1], r[2], q, p})
	}
	samples := []Sample{}
	var out Output
	for i := -*w; i < *n; i++ {
		start := nowNanoseconds()
		out = kernel(rows)
		elapsed := max(int64(1), nowNanoseconds()-start)
		if i >= 0 {
			samples = append(samples, Sample{i + 1, elapsed})
		}
	}
	raw, _ := json.Marshal(out)
	os.WriteFile(*op, raw, 0644)
	raw, _ = json.Marshal(struct {
		Samples []Sample `json:"samples"`
	}{samples})
	os.WriteFile(*tp, raw, 0644)
}
