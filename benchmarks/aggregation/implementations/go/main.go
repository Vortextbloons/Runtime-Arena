package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
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

type catAgg struct {
	quantity, value int64
}

type acctAgg struct {
	value int64
}

func kernel(rows []Row) Output {
	cm := make(map[string]catAgg, 64)
	am := make(map[string]acctAgg, 128)
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
		x.quantity += r.Quantity
		x.value += v
		cm[r.Category] = x
		y := am[r.Account]
		y.value += v
		am[r.Account] = y
	}
	cats := make([]Category, 0, len(cm))
	for k, v := range cm {
		cats = append(cats, Category{k, v.quantity, v.value})
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
		accounts = append(accounts, Account{k, v.value})
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
	rows := readRows(*ip)
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
			last = kernel(rows)
			respond(map[string]any{"type": "result", "requestId": req.RequestId, "digest": outputDigest(last)})
		}
	}
}
