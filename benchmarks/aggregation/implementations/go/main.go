package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
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

// Hot-path scratch reused across iterations: cleared in place so bucket
// arrays and key strings survive warmup (no regrow, no re-scan, no GC churn).
var (
	catMap   = make(map[string]*catAgg, 64)
	acctMap  = make(map[string]*acctAgg, 256)
	catKeys  = make([]string, 0, 64)
	acctKeys = make([]string, 0, 256)
	catsBuf  = make([]Category, 0, 64)
	topBuf   = make([]Account, 0, 16)
	wbBuf    = make([]byte, 0, 2048)
	outBuf   = make([]byte, 0, 4096)
)

type catAgg struct {
	quantity, value int64
}

type acctAgg struct {
	value int64
}

func kernel(rows []Row) []byte {
	for _, k := range catKeys {
		p := catMap[k]
		p.quantity = 0
		p.value = 0
	}
	for _, k := range acctKeys {
		acctMap[k].value = 0
	}
	var q, total int64
	min := int64(^uint64(0) >> 1)
	var max int64
	for i := range rows {
		r := &rows[i]
		v := r.Quantity * r.Price
		q += r.Quantity
		total += v
		if v < min {
			min = v
		}
		if v > max {
			max = v
		}
		if x, ok := catMap[r.Category]; ok {
			x.quantity += r.Quantity
			x.value += v
		} else {
			catMap[r.Category] = &catAgg{quantity: r.Quantity, value: v}
			catKeys = append(catKeys, r.Category)
		}
		if y, ok := acctMap[r.Account]; ok {
			y.value += v
		} else {
			acctMap[r.Account] = &acctAgg{value: v}
			acctKeys = append(acctKeys, r.Account)
		}
	}
	cats := catsBuf[:0]
	for _, k := range catKeys {
		v := catMap[k]
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
	// Top-10 by single-pass tournament: O(A*10), no full sort, no garbage.
	top := topBuf[:0]
	for _, k := range acctKeys {
		v := acctMap[k].value
		placed := false
		for i, t := range top {
			if v > t.Value || (v == t.Value && k < t.Account) {
				top = append(top, Account{})
				copy(top[i+1:], top[i:])
				top[i] = Account{k, v}
				placed = true
				break
			}
		}
		if !placed && len(top) < 10 {
			top = append(top, Account{k, v})
		}
		if len(top) > 10 {
			top = top[:10]
		}
	}
	wb := wbBuf[:0]
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
	for i, a := range top {
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
	wbBuf = wb[:0]

	// Final output reuses the identical entry bytes (single serialization,
	// no encoding/json reflection anywhere in the hot path).
	out := outBuf[:0]
	out = append(out, `{"benchmark":"aggregation","version":1,"recordCount":`...)
	out = strconv.AppendInt(out, int64(len(rows)), 10)
	out = append(out, `,"totalQuantity":`...)
	out = strconv.AppendInt(out, q, 10)
	out = append(out, `,"totalValueMinorUnits":`...)
	out = strconv.AppendInt(out, total, 10)
	out = append(out, `,"categories":[`...)
	for i, c := range cats {
		if i > 0 {
			out = append(out, ',')
		}
		out = append(out, `{"category":"`...)
		out = append(out, c.Category...)
		out = append(out, `","quantity":`...)
		out = strconv.AppendInt(out, c.Quantity, 10)
		out = append(out, `,"valueMinorUnits":`...)
		out = strconv.AppendInt(out, c.Value, 10)
		out = append(out, '}')
	}
	out = append(out, `],"topAccounts":[`...)
	for i, a := range top {
		if i > 0 {
			out = append(out, ',')
		}
		out = append(out, `{"accountId":"`...)
		out = append(out, a.Account...)
		out = append(out, `","valueMinorUnits":`...)
		out = strconv.AppendInt(out, a.Value, 10)
		out = append(out, '}')
	}
	out = append(out, ']')
	out = append(out, `,"minimumTransactionMinorUnits":`...)
	out = strconv.AppendInt(out, min, 10)
	out = append(out, `,"maximumTransactionMinorUnits":`...)
	out = strconv.AppendInt(out, max, 10)
	out = append(out, `,"checksum":"`...)
	var hexSum [64]byte
	hex.Encode(hexSum[:], sum[:])
	out = append(out, hexSum[:]...)
	out = append(out, `"}`...)
	catsBuf = cats[:0]
	topBuf = top[:0]
	outBuf = out[:0:cap(out)]
	// Return an owned copy: outBuf is reused next iteration.
	cp := make([]byte, len(out))
	copy(cp, out)
	return cp
}

func readRows(path string) []Row {
	f, _ := os.Open(path)
	defer f.Close()
	r := bufio.NewReaderSize(f, 1<<20)
	line, _ := r.ReadSlice('\n') // skip header
	_ = line
	var rows []Row
	for {
		line, err := r.ReadSlice('\n')
		if len(line) > 0 {
			if line[len(line)-1] == '\n' {
				line = line[:len(line)-1]
			}
			if n := len(line); n > 0 && line[n-1] == '\r' {
				line = line[:n-1]
			}
			if len(line) > 0 {
				// timestamp,account,category,quantity,price: scan 4 commas.
				c0 := indexByte(line, ',')
				if c0 < 0 {
					continue
				}
				rest := line[c0+1:]
				c1 := indexByte(rest, ',')
				if c1 < 0 {
					continue
				}
				account := rest[:c1]
				rest = rest[c1+1:]
				c2 := indexByte(rest, ',')
				if c2 < 0 {
					continue
				}
				category := rest[:c2]
				rest = rest[c2+1:]
				c3 := indexByte(rest, ',')
				if c3 < 0 {
					continue
				}
				q, err1 := parseInt(rest[:c3])
				p, err2 := parseInt(rest[c3+1:])
				if err1 != nil || err2 != nil {
					continue
				}
				rows = append(rows, Row{string(account), string(category), q, p})
			}
		}
		if err != nil {
			break
		}
	}
	return rows
}

func indexByte(b []byte, c byte) int {
	for i, v := range b {
		if v == c {
			return i
		}
	}
	return -1
}

func parseInt(b []byte) (int64, error) {
	return strconv.ParseInt(string(b), 10, 64)
}

func outputDigest(raw []byte) string {
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
	scanner.Buffer(make([]byte, 65536), 65536)
	var last []byte
	var lastDigest string
	for scanner.Scan() {
		var req struct {
			Type      string `json:"type"`
			RequestId int    `json:"requestId"`
		}
		json.Unmarshal(scanner.Bytes(), &req)
		if req.Type == "finish" {
			os.WriteFile(*op, last, 0644)
			respond(map[string]string{"type": "finish", "digest": lastDigest})
			return
		}
		if req.Type == "run" {
			last = kernel(rows)
			lastDigest = outputDigest(last)
			respond(map[string]any{"type": "result", "requestId": req.RequestId, "digest": lastDigest})
		}
	}
}
