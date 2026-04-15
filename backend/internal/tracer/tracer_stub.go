//go:build !linux
package tracer

import (
	"log"
	"os/exec"
)

// TraceLoop is a stub for non-Linux systems (like macOS/Windows).
// SysCV relies on Linux `ptrace`, so the real tracing logic
// is in tracer_amd64.go and tracer_arm64.go (which only compile on Linux).
// This stub exists so your IDE doesn't complain about "undefined: tracer.TraceLoop"
// when you are viewing the code on a Mac or Windows machine!
func TraceLoop(cmd *exec.Cmd, stream chan<- interface{}, controlChan <-chan string) {
	log.Println("WARNING: ptrace is not supported on this OS. Please run via Docker.")
	close(stream)
}
