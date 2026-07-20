package main

import protocol "runtime-arena/protocol"

func main() {
	protocol.RunWorker(
		protocol.Arg("--input"),
		protocol.Arg("--output"),
		func() any {
			return map[string]any{"benchmark": "minimal", "version": 1, "value": 42}
		},
	)
}
