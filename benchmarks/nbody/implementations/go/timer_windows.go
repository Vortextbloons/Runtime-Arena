//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

var queryPerformanceCounter = syscall.NewLazyDLL("kernel32.dll").NewProc("QueryPerformanceCounter")
var queryPerformanceFrequency = syscall.NewLazyDLL("kernel32.dll").NewProc("QueryPerformanceFrequency")
var performanceFrequency = func() int64 {
	var value int64
	queryPerformanceFrequency.Call(uintptr(unsafe.Pointer(&value)))
	return value
}()

func nowNanoseconds() int64 {
	var value int64
	queryPerformanceCounter.Call(uintptr(unsafe.Pointer(&value)))
	return value/performanceFrequency*1_000_000_000 + value%performanceFrequency*1_000_000_000/performanceFrequency
}
