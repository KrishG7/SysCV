//go:build linux && amd64

package tracer

import (
	"log"
	"os/exec"
	"runtime"
	"syscall"

	"syscv-backend/internal/syscalls"
)

func TraceLoop(cmd *exec.Cmd, stream chan<- interface{}, controlChan <-chan string) {
	// 1. Lock OS thread (safe to nest if already called in main.go)
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	defer close(stream)
	pid := cmd.Process.Pid

	var wstat syscall.WaitStatus

	// 2. ONLY wait for our specific PID. Never use -1.
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

	// 3. ONLY TRACESYSGOOD. Omit TRACECLONE to prevent glibc deadlocks!
	if err := syscall.PtraceSetOptions(pid, syscall.PTRACE_O_TRACESYSGOOD); err != nil {
		log.Println("PtraceSetOptions:", err)
		stream <- ProcessExitEvent{Type: "exit", ExitCode: -1}
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
		// 4. Again, STRICTLY wait for specific PID
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
				var regs syscall.PtraceRegs
				if err := syscall.PtraceGetRegs(pid, &regs); err != nil {
					log.Println("PtraceGetRegs:", err)
					goto resume
				}

				// AMD64 mapping
				sysNum := regs.Orig_rax
				def := syscalls.GetDef(sysNum)

				if !inSyscall {
					// Entry
					rawArgs := []uint64{regs.Rdi, regs.Rsi, regs.Rdx, regs.R10, regs.R8, regs.R9}
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
					// Exit
					retVal := int64(regs.Rax)
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
				// Ignore other ptrace stops
			default:
				// Forward real signals
				sigToForward = int(sig)
			}
		}

	resume:
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

		if err := syscall.PtraceSyscall(pid, sigToForward); err != nil {
			log.Println("PtraceSyscall loop:", err)
			break
		}
	}
}
