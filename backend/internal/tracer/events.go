package tracer

type HydratedArg struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	RawValue uint64 `json:"raw_value"`
	StrValue string `json:"str_value,omitempty"`
}

type SyscallEvent struct {
	Type        string        `json:"type"`
	Name        string        `json:"name"`
	Description string        `json:"description"`
	Number      uint64        `json:"number"`
	Args        []HydratedArg `json:"args"`
	Ret         int64         `json:"ret,omitempty"`
	IsExit      bool          `json:"is_exit"`
}

type ProcessExitEvent struct {
	Type       string `json:"type"`
	ExitCode   int    `json:"exit_code"`
	ExitSignal int    `json:"exit_signal,omitempty"`
}

// OutputEvent carries text that the traced program wrote to stdout or stderr.
// It is emitted by the tracer whenever a write(fd=1,...) or write(fd=2,...)
// syscall completes successfully, making terminal output visible in real-time.
type OutputEvent struct {
	Type string `json:"type"` // always "output"
	Text string `json:"text"`
}
