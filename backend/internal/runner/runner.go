package runner

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

// Compile compiles C source into a dynamic binary inside a temp dir.
// We do NOT inject any preamble or setvbuf constructor — those caused a
// futex(FUTEX_WAIT) deadlock under ptrace when glibc's FILE mutex was
// acquired before the process was fully initialised.
//
// Output notes:
//   - write(1,...) / write(2,...) → immediately visible via tracer interception
//   - printf / puts               → visible: pipe reader in main.go flushes at exit
//   - For truly immediate printf, the user can call fflush(stdout) or write()
func Compile(code string) (string, error) {
	tmpDir, err := os.MkdirTemp("", "syscv")
	if err != nil {
		return "", fmt.Errorf("could not create temp dir: %v", err)
	}

	srcFile := filepath.Join(tmpDir, "prog.c")
	if err := os.WriteFile(srcFile, []byte(code), 0644); err != nil {
		return "", fmt.Errorf("could not write source: %v", err)
	}

	exeFile := filepath.Join(tmpDir, "prog")

	// Dynamic linking: far fewer startup syscalls under ptrace, no static-glibc
	// threading / futex init that can deadlock the tracer.
	// flags: -O0 (no optimisation so syscall patterns match source), -g (debug info)
	cmd := exec.Command("gcc", srcFile, "-o", exeFile, "-g", "-O0", "-lm")
	if out, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("compile error:\n%s", string(out))
	}

	return exeFile, nil
}

// StartTrace launches the binary under ptrace.
// The returned io.ReadCloser streams the program's combined stdout+stderr —
// read it concurrently to capture any buffered printf output that only flushes
// at process exit.
func StartTrace(exePath string) (*exec.Cmd, io.ReadCloser, error) {
	pr, pw, err := os.Pipe()
	if err != nil {
		return nil, nil, fmt.Errorf("pipe error: %v", err)
	}

	cmd := exec.Command(exePath)
	cmd.Stdout = pw
	cmd.Stderr = pw
	cmd.SysProcAttr = &syscall.SysProcAttr{Ptrace: true}

	if err := cmd.Start(); err != nil {
		pw.Close()
		pr.Close()
		return nil, nil, fmt.Errorf("start error: %v", err)
	}

	// Close the write-end in the parent so pr.Read() sees EOF when the child exits.
	pw.Close()
	return cmd, pr, nil
}
