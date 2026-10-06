package main

import (
	"bytes"
	"container/list"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"io"
	"os"
	"sort"
)

const exchangeSafe int64 = 9007199254740991

type exchangeInput struct {
	SchemaVersion string            `json:"schemaVersion"`
	Instruments   [][]int64         `json:"instruments"`
	Accounts      []json.RawMessage `json:"accounts"`
	Events        [][]int64         `json:"events"`
}

func (in *exchangeInput) UnmarshalJSON(data []byte) error {
	// No input field permits null (including numeric array members).
	dec := json.NewDecoder(bytes.NewReader(data))
	for {
		token, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		if token == nil {
			return errors.New("null is not permitted in exchange input")
		}
	}
	type plain exchangeInput
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	return d.Decode((*plain)(in))
}

type exchangeSummary struct {
	InstrumentID      int64  `json:"instrumentId"`
	MinPrice          int64  `json:"minPrice"`
	MaxPrice          int64  `json:"maxPrice"`
	Halted            bool   `json:"halted"`
	BestBid           *int64 `json:"bestBid"`
	BestAsk           *int64 `json:"bestAsk"`
	LastTradePrice    *int64 `json:"lastTradePrice"`
	TradedQuantity    int64  `json:"tradedQuantity"`
	TradedValue       int64  `json:"tradedValue"`
	TradeCount        int64  `json:"tradeCount"`
	BidLevelCount     int    `json:"bidLevelCount"`
	AskLevelCount     int    `json:"askLevelCount"`
	RestingOrderCount int    `json:"restingOrderCount"`
}
type exchangeRanking struct {
	AccountID   int64 `json:"accountId"`
	TradedValue int64 `json:"tradedValue"`
}
type exchangeOutput struct {
	Benchmark            string            `json:"benchmark"`
	Version              int               `json:"version"`
	EventCount           int64             `json:"eventCount"`
	AcceptedEventCount   int64             `json:"acceptedEventCount"`
	RejectedEventCount   int64             `json:"rejectedEventCount"`
	AcceptedOrderCount   int64             `json:"acceptedOrderCount"`
	RejectedOrderCount   int64             `json:"rejectedOrderCount"`
	AcceptedReplaceCount int64             `json:"acceptedReplaceCount"`
	RejectedReplaceCount int64             `json:"rejectedReplaceCount"`
	CancelledOrderCount  int64             `json:"cancelledOrderCount"`
	TradeCount           int64             `json:"tradeCount"`
	TradedQuantity       int64             `json:"tradedQuantity"`
	TradedValue          int64             `json:"tradedValue"`
	SnapshotCount        int64             `json:"snapshotCount"`
	OpenOrderCount       int               `json:"openOrderCount"`
	InstrumentSummaries  []exchangeSummary `json:"instrumentSummaries"`
	TopAccounts          []exchangeRanking `json:"topAccounts"`
	BookChecksum         string            `json:"bookChecksum"`
	AccountChecksum      string            `json:"accountChecksum"`
	TradeChecksum        string            `json:"tradeChecksum"`
	SnapshotChecksum     string            `json:"snapshotChecksum"`
	EventChecksum        string            `json:"eventChecksum"`
}
type exchangePosition struct{ total, reserved int64 }
type exchangeAccount struct {
	id, cash, reserved, notional int64
	positions                    map[int64]*exchangePosition
}

func (a *exchangeAccount) position(id int64) *exchangePosition {
	p := a.positions[id]
	if p == nil {
		p = &exchangePosition{}
		a.positions[id] = p
	}
	return p
}

type exchangeOrder struct {
	id, account, instrument, side, price, quantity, priority int64
	element                                                  *list.Element
}
type exchangeBook struct {
	prices []int64
	levels map[int64]*list.List
	side   int64
}

func (b *exchangeBook) add(o *exchangeOrder) {
	q := b.levels[o.price]
	if q == nil {
		q = list.New()
		b.levels[o.price] = q
		i := sort.Search(len(b.prices), func(i int) bool {
			if b.side == 0 {
				return b.prices[i] <= o.price
			}
			return b.prices[i] >= o.price
		})
		b.prices = append(b.prices, 0)
		copy(b.prices[i+1:], b.prices[i:])
		b.prices[i] = o.price
	}
	o.element = q.PushBack(o)
}
func (b *exchangeBook) remove(o *exchangeOrder) {
	q := b.levels[o.price]
	q.Remove(o.element)
	if q.Len() == 0 {
		delete(b.levels, o.price)
		i := sort.Search(len(b.prices), func(i int) bool {
			if b.side == 0 {
				return b.prices[i] <= o.price
			}
			return b.prices[i] >= o.price
		})
		b.prices = append(b.prices[:i], b.prices[i+1:]...)
	}
}

type exchangeInstrument struct {
	id, low, high int64
	halted        bool
	live          int
	books         [2]exchangeBook
	summary       exchangeSummary
}
type exchangeState struct {
	accounts                                                        map[int64]*exchangeAccount
	instruments                                                     map[int64]*exchangeInstrument
	orders                                                          map[int64]*exchangeOrder
	out                                                             exchangeOutput
	tradeHash, snapshotHash, eventHash                              hash.Hash
	initialCash, deposits, withdrawals, admitted, executed, removed int64
	initialInventory                                                map[int64]int64
}

func exchangeAdd(a, b int64) (int64, error) {
	if b < 0 || a < 0 || a > exchangeSafe-b {
		return 0, errors.New("exchange safe-integer bound exceeded")
	}
	return a + b, nil
}
func exchangeProduct(a, b int64) (int64, error) {
	if a < 0 || b < 0 || (b != 0 && a > exchangeSafe/b) {
		return 0, errors.New("exchange safe-integer product exceeded")
	}
	return a * b, nil
}
func exchangeID(v int64) bool { return v > 0 && v <= 2147483647 }
func newExchange(in exchangeInput) (*exchangeState, error) {
	if in.SchemaVersion != "1.0.0" || len(in.Instruments) == 0 || len(in.Accounts) == 0 || len(in.Events) == 0 {
		return nil, errors.New("invalid exchange input header")
	}
	s := &exchangeState{accounts: map[int64]*exchangeAccount{}, instruments: map[int64]*exchangeInstrument{}, orders: map[int64]*exchangeOrder{}, initialInventory: map[int64]int64{}, tradeHash: sha256.New(), snapshotHash: sha256.New(), eventHash: sha256.New(), out: exchangeOutput{Benchmark: "arena-exchange", Version: 1, InstrumentSummaries: []exchangeSummary{}, TopAccounts: []exchangeRanking{}}}
	for _, r := range in.Instruments {
		if len(r) != 3 || !exchangeID(r[0]) || r[1] <= 0 || r[2] < r[1] || r[2] > exchangeSafe || s.instruments[r[0]] != nil {
			return nil, errors.New("invalid or duplicate instrument")
		}
		x := &exchangeInstrument{id: r[0], low: r[1], high: r[2], summary: exchangeSummary{InstrumentID: r[0]}}
		for side := 0; side < 2; side++ {
			x.books[side] = exchangeBook{side: int64(side), levels: map[int64]*list.List{}}
		}
		s.instruments[x.id] = x
	}
	for _, raw := range in.Accounts {
		var fields []json.RawMessage
		if err := json.Unmarshal(raw, &fields); err != nil || len(fields) != 3 {
			return nil, errors.New("invalid account tuple")
		}
		var id, cash int64
		var positions [][]int64
		if json.Unmarshal(fields[0], &id) != nil || json.Unmarshal(fields[1], &cash) != nil || json.Unmarshal(fields[2], &positions) != nil || !exchangeID(id) || cash < 0 || cash > exchangeSafe || s.accounts[id] != nil {
			return nil, errors.New("invalid or duplicate account")
		}
		a := &exchangeAccount{id: id, cash: cash, positions: map[int64]*exchangePosition{}}
		var err error
		s.initialCash, err = exchangeAdd(s.initialCash, cash)
		if err != nil {
			return nil, err
		}
		for _, p := range positions {
			if len(p) != 2 || s.instruments[p[0]] == nil || p[1] < 0 || p[1] > exchangeSafe || a.positions[p[0]] != nil {
				return nil, errors.New("invalid or duplicate position")
			}
			a.positions[p[0]] = &exchangePosition{total: p[1]}
			s.initialInventory[p[0]], err = exchangeAdd(s.initialInventory[p[0]], p[1])
			if err != nil {
				return nil, err
			}
		}
		s.accounts[id] = a
	}
	seen := map[int64]bool{}
	lengths := []int{8, 7, 4, 6, 4, 4, 3, 3, 5, 4, 2}
	submitted := int64(0)
	for index, e := range in.Events {
		if len(e) < 2 || e[0] < 0 || e[0] > 10 || len(e) != lengths[e[0]] || e[1] != int64(index+1) {
			return nil, fmt.Errorf("invalid event tuple at %d", index+1)
		}
		for _, v := range e {
			if v < 0 || v > exchangeSafe {
				return nil, errors.New("event number outside safe-integer range")
			}
		}
		if e[0] == 0 || e[0] == 1 || e[0] == 3 {
			var err error
			submitted, err = exchangeAdd(submitted, e[len(e)-1])
			if err != nil {
				return nil, err
			}
		}
		switch e[0] {
		case 0, 1:
			if !exchangeID(e[2]) || !exchangeID(e[3]) || !exchangeID(e[4]) || e[5] > 1 || e[len(e)-1] == 0 || seen[e[2]] {
				return nil, errors.New("invalid or reused submitted order ID")
			}
			seen[e[2]] = true
			if e[0] == 0 && e[6] == 0 {
				return nil, errors.New("limit price must be positive")
			}
		case 2, 3:
			if !exchangeID(e[2]) || !exchangeID(e[3]) {
				return nil, errors.New("invalid cancel/replace ID")
			}
			if e[0] == 3 && (e[4] == 0 || e[5] == 0) {
				return nil, errors.New("replacement price/quantity must be positive")
			}
		case 4, 5:
			if !exchangeID(e[2]) || e[3] == 0 {
				return nil, errors.New("invalid funding event")
			}
		case 6, 7, 8, 9:
			if !exchangeID(e[2]) {
				return nil, errors.New("invalid instrument ID")
			}
			if e[0] == 8 && (e[3] == 0 || e[4] < e[3]) {
				return nil, errors.New("invalid price band")
			}
			if e[0] == 9 && (e[3] < 1 || e[3] > 10) {
				return nil, errors.New("invalid snapshot depth")
			}
		case 10:
			if index != len(in.Events)-1 {
				return nil, errors.New("settlement must be last")
			}
		}
	}
	if in.Events[len(in.Events)-1][0] != 10 {
		return nil, errors.New("missing settlement")
	}
	return s, nil
}
func (s *exchangeState) unreserve(o *exchangeOrder) {
	a := s.accounts[o.account]
	if o.side == 0 {
		a.reserved -= o.price * o.quantity
	} else {
		a.position(o.instrument).reserved -= o.quantity
	}
}
func (s *exchangeState) remove(o *exchangeOrder, cancel bool) {
	s.unreserve(o)
	s.instruments[o.instrument].books[o.side].remove(o)
	s.instruments[o.instrument].live--
	delete(s.orders, o.id)
	if cancel {
		s.out.CancelledOrderCount++
		s.removed += o.quantity
	}
}
func (s *exchangeState) preflight(o *exchangeOrder, market bool, old *exchangeOrder) (int64, int64, bool, error) {
	x := s.instruments[o.instrument]
	a := s.accounts[o.account]
	if x == nil || a == nil || x.halted || (!market && (o.price < x.low || o.price > x.high)) {
		return 0, 0, false, nil
	}
	remaining, cost := o.quantity, int64(0)
	book := &x.books[1-o.side]
	for _, price := range book.prices {
		if !market && ((o.side == 0 && price > o.price) || (o.side == 1 && price < o.price)) {
			break
		}
		for el := book.levels[price].Front(); el != nil && remaining > 0; el = el.Next() {
			maker := el.Value.(*exchangeOrder)
			if maker.account == o.account {
				return 0, 0, false, nil
			}
			q := min(remaining, maker.quantity)
			v, err := exchangeProduct(q, price)
			if err != nil {
				return 0, 0, false, err
			}
			cost, err = exchangeAdd(cost, v)
			if err != nil {
				return 0, 0, false, err
			}
			remaining -= q
		}
		if remaining == 0 {
			break
		}
	}
	filled := o.quantity - remaining
	if market && filled == 0 {
		return 0, 0, false, nil
	}
	availableCash := a.cash - a.reserved
	availableInventory := a.position(o.instrument).total - a.position(o.instrument).reserved
	if old != nil {
		if old.side == 0 {
			availableCash += old.price * old.quantity
		} else {
			availableInventory += old.quantity
		}
	}
	if o.side == 0 {
		needed := cost
		if !market {
			v, err := exchangeProduct(o.price, remaining)
			if err != nil {
				return 0, 0, false, err
			}
			needed, err = exchangeAdd(needed, v)
			if err != nil {
				return 0, 0, false, err
			}
		}
		if needed > availableCash {
			return 0, 0, false, nil
		}
	} else {
		needed := o.quantity
		if market {
			needed = filled
		}
		if needed > availableInventory {
			return 0, 0, false, nil
		}
	}
	return filled, cost, true, nil
}
func (s *exchangeState) execute(o *exchangeOrder, market bool, filled int64) error {
	x := s.instruments[o.instrument]
	remainingFill := filled
	for remainingFill > 0 {
		book := &x.books[1-o.side]
		maker := book.levels[book.prices[0]].Front().Value.(*exchangeOrder)
		q := min(remainingFill, maker.quantity)
		value := maker.price * q
		buyer, seller := s.accounts[o.account], s.accounts[maker.account]
		if o.side == 1 {
			buyer, seller = seller, buyer
		}
		var err error
		s.out.TradedValue, err = exchangeAdd(s.out.TradedValue, value)
		if err != nil {
			return err
		}
		s.out.TradedQuantity, err = exchangeAdd(s.out.TradedQuantity, q)
		if err != nil {
			return err
		}
		buyer.cash -= value
		seller.cash += value
		buyer.position(o.instrument).total += q
		seller.position(o.instrument).total -= q
		buyer.notional += value
		seller.notional += value
		if maker.side == 0 {
			s.accounts[maker.account].reserved -= maker.price * q
		} else {
			s.accounts[maker.account].position(o.instrument).reserved -= q
		}
		maker.quantity -= q
		o.quantity -= q
		remainingFill -= q
		s.executed += 2 * q
		s.out.TradeCount++
		x.summary.TradeCount++
		x.summary.TradedQuantity += q
		x.summary.TradedValue += value
		p := maker.price
		x.summary.LastTradePrice = &p
		fmt.Fprintf(s.tradeHash, "%d|%d|%d|%d|%d|%d|%d|%d\n", s.out.TradeCount, o.instrument, maker.id, o.id, maker.account, o.account, maker.price, q)
		if maker.quantity == 0 {
			book.remove(maker)
			x.live--
			delete(s.orders, maker.id)
		}
	}
	if o.quantity > 0 && !market {
		s.orders[o.id] = o
		x.books[o.side].add(o)
		x.live++
		a := s.accounts[o.account]
		if o.side == 0 {
			a.reserved += o.price * o.quantity
		} else {
			a.position(o.instrument).reserved += o.quantity
		}
	} else if market {
		s.removed += o.quantity
	}
	return nil
}
func (s *exchangeState) summary(x *exchangeInstrument) exchangeSummary {
	r := x.summary
	r.MinPrice = x.low
	r.MaxPrice = x.high
	r.Halted = x.halted
	r.BidLevelCount = len(x.books[0].prices)
	r.AskLevelCount = len(x.books[1].prices)
	if r.BidLevelCount > 0 {
		p := x.books[0].prices[0]
		r.BestBid = &p
	}
	if r.AskLevelCount > 0 {
		p := x.books[1].prices[0]
		r.BestAsk = &p
	}
	r.RestingOrderCount = x.live
	return r
}
func exchangeNullable(v *int64) string {
	if v == nil {
		return "-"
	}
	return fmt.Sprint(*v)
}
func (s *exchangeState) snapshot(event, instrument, depth int64) {
	x := s.instruments[instrument]
	r := s.summary(x)
	halted := 0
	if x.halted {
		halted = 1
	}
	fmt.Fprintf(s.snapshotHash, "S|%d|%d|%d|%d|%d|%d|%s|%s|%s|%d|%d|%d|%d|%d|%d\n", event, instrument, depth, x.low, x.high, halted, exchangeNullable(r.BestBid), exchangeNullable(r.BestAsk), exchangeNullable(r.LastTradePrice), r.TradedQuantity, r.TradedValue, r.TradeCount, r.BidLevelCount, r.AskLevelCount, r.RestingOrderCount)
	for side := 0; side < 2; side++ {
		b := &x.books[side]
		for _, p := range b.prices[:min(int(depth), len(b.prices))] {
			var q int64
			for el := b.levels[p].Front(); el != nil; el = el.Next() {
				q += el.Value.(*exchangeOrder).quantity
			}
			fmt.Fprintf(s.snapshotHash, "L|%d|%s|%d|%d|%d\n", event, []string{"b", "s"}[side], p, q, b.levels[p].Len())
		}
	}
	s.out.SnapshotCount++
}
func (s *exchangeState) event(e []int64) (bool, error) {
	switch e[0] {
	case 0, 1:
		o := &exchangeOrder{id: e[2], account: e[3], instrument: e[4], side: e[5], priority: e[1], quantity: e[len(e)-1]}
		market := e[0] == 1
		if !market {
			o.price = e[6]
		}
		filled, _, ok, err := s.preflight(o, market, nil)
		if err != nil {
			return false, err
		}
		if !ok {
			s.out.RejectedOrderCount++
			return false, nil
		}
		s.out.AcceptedOrderCount++
		s.admitted += o.quantity
		return true, s.execute(o, market, filled)
	case 2:
		o := s.orders[e[3]]
		if o == nil || o.account != e[2] {
			return false, nil
		}
		s.remove(o, true)
		return true, nil
	case 3:
		old := s.orders[e[3]]
		if old == nil || old.account != e[2] {
			s.out.RejectedReplaceCount++
			return false, nil
		}
		o := &exchangeOrder{id: old.id, account: old.account, instrument: old.instrument, side: old.side, price: e[4], quantity: e[5], priority: e[1]}
		filled, _, ok, err := s.preflight(o, false, old)
		if err != nil {
			return false, err
		}
		if !ok {
			s.out.RejectedReplaceCount++
			return false, nil
		}
		s.remove(old, true)
		s.out.AcceptedReplaceCount++
		s.admitted += o.quantity
		return true, s.execute(o, false, filled)
	case 4, 5:
		a := s.accounts[e[2]]
		if a == nil {
			return false, nil
		}
		if e[0] == 5 {
			if a.cash-a.reserved < e[3] {
				return false, nil
			}
			a.cash -= e[3]
			s.withdrawals += e[3]
		} else {
			v, err := exchangeAdd(s.initialCash+s.deposits, e[3])
			if err != nil {
				return false, err
			}
			s.deposits = v - s.initialCash
			a.cash += e[3]
		}
		return true, nil
	case 6, 7:
		x := s.instruments[e[2]]
		halt := e[0] == 6
		if x == nil || x.halted == halt {
			return false, nil
		}
		x.halted = halt
		return true, nil
	case 8:
		x := s.instruments[e[2]]
		if x == nil {
			return false, nil
		}
		x.low = e[3]
		x.high = e[4]
		for side := 0; side < 2; side++ {
			b := &x.books[side]
			prices := append([]int64(nil), b.prices...)
			for _, p := range prices {
				if p >= x.low && p <= x.high {
					continue
				}
				q := b.levels[p]
				for q.Len() > 0 {
					s.remove(q.Front().Value.(*exchangeOrder), true)
				}
			}
		}
		return true, nil
	case 9:
		if s.instruments[e[2]] == nil {
			return false, nil
		}
		s.snapshot(e[1], e[2], e[3])
		return true, nil
	case 10:
		return true, nil
	}
	return false, errors.New("unknown event")
}
func exchangeIDs[T any](m map[int64]T) []int64 {
	ids := make([]int64, 0, len(m))
	for id := range m {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	return ids
}
func exchangeDigest(h hash.Hash) string { return hex.EncodeToString(h.Sum(nil)) }
func (s *exchangeState) finish() (exchangeOutput, error) {
	bookHash, accountHash := sha256.New(), sha256.New()
	remaining := int64(0)
	for _, id := range exchangeIDs(s.instruments) {
		x := s.instruments[id]
		s.out.InstrumentSummaries = append(s.out.InstrumentSummaries, s.summary(x))
		for side := 0; side < 2; side++ {
			b := &x.books[side]
			for _, p := range b.prices {
				for el := b.levels[p].Front(); el != nil; el = el.Next() {
					o := el.Value.(*exchangeOrder)
					remaining += o.quantity
					fmt.Fprintf(bookHash, "%d|%s|%d|%d|%d|%d|%d\n", id, []string{"b", "s"}[side], p, o.id, o.account, o.quantity, o.priority)
				}
			}
		}
	}
	cash := int64(0)
	inventory := map[int64]int64{}
	reservedCash := map[int64]int64{}
	reservedInventory := map[[2]int64]int64{}
	for _, o := range s.orders {
		if o.side == 0 {
			reservedCash[o.account] += o.price * o.quantity
		} else {
			reservedInventory[[2]int64{o.account, o.instrument}] += o.quantity
		}
	}
	for _, id := range exchangeIDs(s.accounts) {
		a := s.accounts[id]
		if a.cash < 0 || a.reserved < 0 || a.reserved > a.cash || a.reserved != reservedCash[id] {
			return s.out, errors.New("cash reservation invariant failed")
		}
		cash += a.cash
		fmt.Fprintf(accountHash, "A|%d|%d|%d\n", id, a.cash, a.reserved)
		for _, instrument := range exchangeIDs(a.positions) {
			p := a.positions[instrument]
			if p.total < 0 || p.reserved < 0 || p.reserved > p.total || p.reserved != reservedInventory[[2]int64{id, instrument}] {
				return s.out, errors.New("inventory reservation invariant failed")
			}
			inventory[instrument] += p.total
			if p.total != 0 || p.reserved != 0 {
				fmt.Fprintf(accountHash, "P|%d|%d|%d|%d\n", id, instrument, p.total, p.reserved)
			}
		}
		s.out.TopAccounts = append(s.out.TopAccounts, exchangeRanking{id, a.notional})
	}
	if cash != s.initialCash+s.deposits-s.withdrawals || s.admitted != s.executed+s.removed+remaining {
		return s.out, errors.New("exchange conservation invariant failed")
	}
	for id := range s.instruments {
		if inventory[id] != s.initialInventory[id] {
			return s.out, errors.New("inventory conservation invariant failed")
		}
	}
	sort.Slice(s.out.TopAccounts, func(i, j int) bool {
		a, b := s.out.TopAccounts[i], s.out.TopAccounts[j]
		if a.TradedValue != b.TradedValue {
			return a.TradedValue > b.TradedValue
		}
		return a.AccountID < b.AccountID
	})
	s.out.TopAccounts = s.out.TopAccounts[:min(10, len(s.out.TopAccounts))]
	s.out.OpenOrderCount = len(s.orders)
	s.out.BookChecksum = exchangeDigest(bookHash)
	s.out.AccountChecksum = exchangeDigest(accountHash)
	s.out.TradeChecksum = exchangeDigest(s.tradeHash)
	s.out.SnapshotChecksum = exchangeDigest(s.snapshotHash)
	s.out.EventChecksum = exchangeDigest(s.eventHash)
	return s.out, nil
}
func runExchange(in exchangeInput) (exchangeOutput, error) {
	s, err := newExchange(in)
	if err != nil {
		return exchangeOutput{}, err
	}
	for _, e := range in.Events {
		trades, quantity, open := s.out.TradeCount, s.out.TradedQuantity, len(s.orders)
		ok, err := s.event(e)
		if err != nil {
			return s.out, fmt.Errorf("event %d: %w", e[1], err)
		}
		flag := 0
		if ok {
			flag = 1
			s.out.AcceptedEventCount++
		} else {
			s.out.RejectedEventCount++
		}
		fmt.Fprintf(s.eventHash, "%d|%d|%d|%d|%d|%d\n", e[1], e[0], flag, s.out.TradeCount-trades, s.out.TradedQuantity-quantity, len(s.orders)-open)
		s.out.EventCount++
	}
	return s.finish()
}

// Typed decoding alone cannot distinguish an omitted zero/null field. Check
// required fields recursively against the reference result's JSON shape.
func exchangeRequired(actual, expected any) bool {
	switch want := expected.(type) {
	case map[string]any:
		got, ok := actual.(map[string]any)
		if !ok || len(got) != len(want) {
			return false
		}
		for k, v := range want {
			a, exists := got[k]
			if !exists || !exchangeRequired(a, v) {
				return false
			}
		}
	case []any:
		got, ok := actual.([]any)
		if !ok || len(got) != len(want) {
			return false
		}
		for i, v := range want {
			if !exchangeRequired(got[i], v) {
				return false
			}
		}
	default:
		return actual == expected
	}
	return true
}
func checkExchangeOutput(file string, want exchangeOutput, out exchangeOutput) error {
	data, err := os.ReadFile(file)
	if err != nil {
		return err
	}
	var actual, expected any
	json.Unmarshal(data, &actual)
	encoded, _ := json.Marshal(want)
	json.Unmarshal(encoded, &expected)
	if !exchangeRequired(actual, expected) {
		return errors.New("exchange output missing required fields or arrays")
	}
	if !sameJSON(out, want) {
		return errors.New("arena-exchange result mismatch")
	}
	return nil
}
