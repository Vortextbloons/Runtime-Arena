package protocol

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
)

const Version = "2.0.0"

func Arg(name string) string {
	args := os.Args
	for i := 0; i+1 < len(args); i++ {
		if args[i] == name {
			return args[i+1]
		}
	}
	panic(fmt.Sprintf("missing %s", name))
}

func DigestBytes(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func EmitLine(value any) {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(encoded))
}

// RunWorker executes the harness loop. kernel must return JSON-marshalable output.
func RunWorker(inputPath, outputPath string, kernel func() any) {
	if Arg("--protocol-version") != Version {
		panic("unsupported protocol version")
	}
	if _, err := os.ReadFile(inputPath); err != nil {
		panic(err)
	}

	EmitLine(map[string]string{"type": "ready", "protocolVersion": Version})

	var lastOutput []byte
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		var message map[string]any
		if err := json.Unmarshal([]byte(line), &message); err != nil {
			panic(err)
		}
		switch message["type"] {
		case "run":
			lastOutput, _ = json.Marshal(kernel())
			requestID, _ := message["requestId"].(float64)
			EmitLine(map[string]any{
				"type":      "result",
				"requestId": int64(requestID),
				"digest":    DigestBytes(lastOutput),
			})
		case "finish":
			if err := os.WriteFile(outputPath, lastOutput, 0o644); err != nil {
				panic(err)
			}
			EmitLine(map[string]string{"type": "finish", "digest": DigestBytes(lastOutput)})
			return
		default:
			panic(fmt.Sprintf("unknown protocol message type %v", message["type"]))
		}
	}
	if err := scanner.Err(); err != nil {
		panic(err)
	}
}
