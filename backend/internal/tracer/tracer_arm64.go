//go:build linux && arm64

package tracer

import (
	"log"
	"os/exec"
	"runtime"
	"syscall"

	"syscv-backend/internal/syscalls"
)

// TraceLoop runs the ptrace event loop for the given command (already started).
//
// Design: trace the MAIN process only — no child/fork/clone auto-attach.
//
//   - PTRACE_O_TRACESYSGOOD is the only option set. This means SIGTRAP|0x80
//     means "syscall entry/exit" and plain SIGTRAP means any other ptrace stop.
//
//   - PTRACE_O_TRACEFORK / TRACECLONE / TRACEVFORK are intentionally OMITTED.
//     Without them, forked children and cloned threads (including glibc arena
//     threads spawned by malloc) run freely without ptrace attachment. This
//     prevents two failure modes:
//     1. glibc creates a clone() thread, it gets ptrace-stopped, holds a
//     malloc arena lock, parent deadlocks waiting for the lock → timeout.
//     2. Wait4(-1) inside a fork-child handler racing with the initial
//     Wait4(pid) of the NEXT test's TraceLoop.
//
//   - All Wait4 calls use the SPECIFIC pid — never -1. This eliminates the
//     concurrent-goroutine race where an old TraceLoop steals ptrace events
//     (SIGTRAP, gcc zombie exits) that belong to the new session.
//
// Fork/exec test coverage: without TRACEFORK we still see the parent's fork()
// syscall entry/exit and the parent's waitpid() entry/exit, which is enough for
// the test requirements. The child runs freely and its own writes still go to
// the same stdout fd (for exec, /bin/echo output is captured by the shell).
func TraceLoop(cmd *exec.Cmd, stream chan<- interface{}, controlChan <-chan string) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	defer close(stream)
	pid := cmd.Process.Pid

	var wstat syscall.WaitStatus

	// ── Capture the initial SIGTRAP from exec() under ptrace ─────────────────
	// Use Wait4(pid) not Wait4(-1) — other sessions' goroutines can't steal it.
	if _, err := syscall.Wait4(pid, &wstat, 0, nil); err != nil {
		log.Println("wait4 init:", err)
		stream <- ProcessExitEvent{Type: "exit", ExitCode: -1}
		return
	}

	if wstat.Exited() {
		stream <- ProcessExitEvent{Type: "exit", ExitCode: wstat.ExitStatus()}
		return
	}
	if wstat.Signaled() {
		sig := int(wstat.Signal())
		stream <- ProcessExitEvent{Type: "exit", ExitCode: 128 + sig, ExitSignal: sig}
		return
	}

	// Only TRACESYSGOOD — no fork/clone auto-attach, no race-inducing Wait4(-1).
	if err := syscall.PtraceSetOptions(pid, syscall.PTRACE_O_TRACESYSGOOD); err != nil {
		log.Println("PtraceSetOptions:", err)
		var ws2 syscall.WaitStatus
		if _, e2 := syscall.Wait4(pid, &ws2, 0, nil); e2 == nil {
			if ws2.Exited() {
				stream <- ProcessExitEvent{Type: "exit", ExitCode: ws2.ExitStatus()}
			} else if ws2.Signaled() {
				sig := int(ws2.Signal())
				stream <- ProcessExitEvent{Type: "exit", ExitCode: 128 + sig, ExitSignal: sig}
			} else {
				stream <- ProcessExitEvent{Type: "exit", ExitCode: -1}
			}
		} else {
			stream <- ProcessExitEvent{Type: "exit", ExitCode: -1}
		}
		return
	}

	if err := syscall.PtraceSyscall(pid, 0); err != nil {
		log.Println("PtraceSyscall initial:", err)
		stream <- ProcessExitEvent{Type: "exit", ExitCode: -1}
		return
	}

	inSyscall := false
	paused := false

	var pendingWriteFD uint64
	var pendingWriteText string

	for {
		// ── Wait for the main process ONLY (specific pid, never -1) ──────────
		if _, err := syscall.Wait4(pid, &wstat, 0, nil); err != nil {
			log.Println("wait4 loop:", err)
			break
		}

		if wstat.Exited() {
			stream <- ProcessExitEvent{Type: "exit", ExitCode: wstat.ExitStatus()}
			break
		}
		if wstat.Signaled() {
			sig := int(wstat.Signal())
			stream <- ProcessExitEvent{Type: "exit", ExitCode: 128 + sig, ExitSignal: sig}
			break
		}

		sigToForward := 0

		if wstat.Stopped() {
			sig := wstat.StopSignal()
			switch {
			case sig == (syscall.SIGTRAP | 0x80):
				// ── syscall entry / exit ──────────────────────────────────────
				var regs syscall.PtraceRegs
				if err := syscall.PtraceGetRegs(pid, &regs); err != nil {
					log.Println("PtraceGetRegs:", err)
					goto resume
				}

				// ARM64: syscall number in X8, args in X0–X5
				sysNum := regs.Regs[8]
				def := syscalls.GetDef(sysNum)

				if !inSyscall {
					// entry
					rawArgs := []uint64{regs.Regs[0], regs.Regs[1], regs.Regs[2], regs.Regs[3], regs.Regs[4], regs.Regs[5]}
					var hydratedArgs []HydratedArg
					for i, argDef := range def.Args {
						if i >= len(rawArgs) {
							break
						}
						hArg := HydratedArg{
							Name:     argDef.Name,
							Type:     string(argDef.Type),
							RawValue: rawArgs[i],
						}
						if argDef.Type == syscalls.TypeString {
							hArg.StrValue = ReadString(pid, uintptr(rawArgs[i]), 256)
						}
						hydratedArgs = append(hydratedArgs, hArg)
					}

					if def.Name == "write" && len(rawArgs) >= 3 {
						pendingWriteFD = rawArgs[0]
						if pendingWriteFD == 1 || pendingWriteFD == 2 {
							pendingWriteText = ReadString(pid, uintptr(rawArgs[1]), int(rawArgs[2]))
						} else {
							pendingWriteText = ""
						}
					} else {
						pendingWriteText = ""
					}

					stream <- SyscallEvent{
						Type:        "syscall",
						Name:        def.Name,
						Description: def.Description,
						Number:      sysNum,
						Args:        hydratedArgs,
						IsExit:      false,
					}
					inSyscall = true

				} else {
					// exit
					retVal := int64(regs.Regs[0])
					stream <- SyscallEvent{
						Type:        "syscall",
						Name:        def.Name,
						Description: def.Description,
						Number:      sysNum,
						Ret:         retVal,
						IsExit:      true,
					}
					if def.Name == "write" && retVal > 0 && pendingWriteText != "" {
						stream <- OutputEvent{Type: "output", Text: pendingWriteText}
						pendingWriteText = ""
					}
					inSyscall = false
				}

			case sig == syscall.SIGTRAP:
				// Other SIGTRAP stop (PTRACE_EVENT_* or exec SIGTRAP) — skip.

			default:
				// Real signal (SIGSEGV, SIGABRT, etc.) — forward so process
				// handles or dies from it normally.
				sigToForward = int(sig)
			}
		}

	resume:
		// ── Pause / step / play control ───────────────────────────────────────
		if paused {
			for {
				cmd2, ok := <-controlChan
				if !ok {
					syscall.Kill(pid, syscall.SIGKILL)
					return
				}
				switch cmd2 {
				case "play":
					paused = false
				case "step":
					paused = true
				}
				break
			}
		} else {
			select {
			case cmd2, ok := <-controlChan:
				if !ok {
					syscall.Kill(pid, syscall.SIGKILL)
					return
				}
				switch cmd2 {
				case "pause":
					paused = true
				case "step":
					paused = true
				}
			default:
			}
		}

		// ── Resume main process ───────────────────────────────────────────────
		if err := syscall.PtraceSyscall(pid, sigToForward); err != nil {
			log.Println("PtraceSyscall loop:", err)
			break
		}
	}
}
