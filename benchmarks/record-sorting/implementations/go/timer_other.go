//go:build !windows

package main

import "time"

func nowNanoseconds() int64 { return time.Now().UnixNano() }
