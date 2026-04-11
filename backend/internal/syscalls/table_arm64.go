//go:build linux && arm64
package syscalls

var Table = map[uint64]SyscallDef{
	// ── Core I/O ──────────────────────────────
	63: {Name: "read", Description: "reads bytes from a file descriptor into a buffer", Args: []ArgDef{
		{Name: "fd", Type: TypeInt}, {Name: "buf", Type: TypePtr}, {Name: "count", Type: TypeInt},
	}},
	64: {Name: "write", Description: "writes bytes from a buffer to a file descriptor", Args: []ArgDef{
		{Name: "fd", Type: TypeInt}, {Name: "buf", Type: TypeString}, {Name: "count", Type: TypeInt},
	}},
	56:  {Name: "openat", Description: "opens a file relative to a directory file descriptor", Args: []ArgDef{{Name: "dirfd", Type: TypeInt}, {Name: "pathname", Type: TypeString}, {Name: "flags", Type: TypeInt}, {Name: "mode", Type: TypeInt}}},
	57:  {Name: "close", Description: "closes a file descriptor, freeing the resource", Args: []ArgDef{{Name: "fd", Type: TypeInt}}},
	59:  {Name: "pipe2", Description: "creates a pipe with flags", Args: []ArgDef{{Name: "pipefd", Type: TypePtr}, {Name: "flags", Type: TypeInt}}},
	61:  {Name: "getdents64", Description: "reads directory entries", Args: []ArgDef{{Name: "fd", Type: TypeInt}, {Name: "dirp", Type: TypePtr}, {Name: "count", Type: TypeInt}}},
	62:  {Name: "lseek", Description: "repositions the offset within a file descriptor", Args: []ArgDef{{Name: "fd", Type: TypeInt}, {Name: "offset", Type: TypeInt}, {Name: "whence", Type: TypeInt}}},
	67:  {Name: "pread64", Description: "reads bytes at a given offset without changing file position", Args: []ArgDef{{Name: "fd", Type: TypeInt}, {Name: "buf", Type: TypePtr}, {Name: "count", Type: TypeInt}, {Name: "offset", Type: TypeInt}}},
	68:  {Name: "pwrite64", Description: "writes bytes at a given offset without changing file position", Args: []ArgDef{{Name: "fd", Type: TypeInt}, {Name: "buf", Type: TypeString}, {Name: "count", Type: TypeInt}, {Name: "offset", Type: TypeInt}}},
	72:  {Name: "pselect6", Description: "waits for events on multiple file descriptors", Args: []ArgDef{{Name: "nfds", Type: TypeInt}, {Name: "readfds", Type: TypePtr}, {Name: "writefds", Type: TypePtr}}},
	73:  {Name: "ppoll", Description: "waits for events on file descriptors with timeout", Args: []ArgDef{{Name: "fds", Type: TypePtr}, {Name: "nfds", Type: TypeInt}, {Name: "timeout", Type: TypePtr}}},
	78:  {Name: "readlinkat", Description: "reads the value of a symbolic link", Args: []ArgDef{{Name: "dirfd", Type: TypeInt}, {Name: "pathname", Type: TypeString}, {Name: "buf", Type: TypePtr}, {Name: "bufsiz", Type: TypeInt}}},
	79:  {Name: "newfstatat", Description: "retrieves file metadata relative to a directory fd", Args: []ArgDef{{Name: "dirfd", Type: TypeInt}, {Name: "pathname", Type: TypeString}, {Name: "statbuf", Type: TypePtr}, {Name: "flags", Type: TypeInt}}},
	80:  {Name: "fstat", Description: "retrieves file metadata by file descriptor", Args: []ArgDef{{Name: "fd", Type: TypeInt}, {Name: "statbuf", Type: TypePtr}}},
	92:  {Name: "exit", Description: "terminates the calling process with a status code", Args: []ArgDef{{Name: "status", Type: TypeInt}}},
	94:  {Name: "exit_group", Description: "terminates all threads in the process", Args: []ArgDef{{Name: "status", Type: TypeInt}}},
	96:  {Name: "set_tid_address", Description: "sets the pointer to the thread ID (for thread cleanup)", Args: []ArgDef{{Name: "tidptr", Type: TypePtr}}},
	98:  {Name: "futex", Description: "fast user-space mutex (blocking synchronization primitive)", Args: []ArgDef{{Name: "uaddr", Type: TypePtr}, {Name: "futex_op", Type: TypeInt}, {Name: "val", Type: TypeInt}}},
	113: {Name: "clock_gettime", Description: "reads the current time from a clock", Args: []ArgDef{{Name: "clockid", Type: TypeInt}, {Name: "tp", Type: TypePtr}}},
	115: {Name: "clock_nanosleep", Description: "sleeps for a high-resolution interval", Args: []ArgDef{{Name: "clockid", Type: TypeInt}, {Name: "flags", Type: TypeInt}, {Name: "request", Type: TypePtr}}},
	117: {Name: "kill", Description: "sends a signal to a process", Args: []ArgDef{{Name: "pid", Type: TypeInt}, {Name: "sig", Type: TypeInt}}},
	122: {Name: "sched_setaffinity", Description: "sets the CPU affinity of a thread", Args: []ArgDef{{Name: "pid", Type: TypeInt}, {Name: "cpusetsize", Type: TypeInt}, {Name: "mask", Type: TypePtr}}},
	160: {Name: "uname", Description: "returns system information (kernel name, version, etc.)", Args: []ArgDef{{Name: "buf", Type: TypePtr}}},
	174: {Name: "getuid", Description: "returns the real user ID of the calling process", Args: []ArgDef{}},
	175: {Name: "geteuid", Description: "returns the effective user ID of the calling process", Args: []ArgDef{}},
	176: {Name: "getgid", Description: "returns the real group ID of the calling process", Args: []ArgDef{}},
	177: {Name: "getegid", Description: "returns the effective group ID of the calling process", Args: []ArgDef{}},
	178: {Name: "gettid", Description: "returns the thread ID of the calling thread", Args: []ArgDef{}},
	214: {Name: "brk", Description: "adjusts the top of the data segment (heap boundary)", Args: []ArgDef{{Name: "brk", Type: TypePtr}}},
	215: {Name: "munmap", Description: "unmaps memory from the process address space", Args: []ArgDef{{Name: "addr", Type: TypePtr}, {Name: "length", Type: TypeInt}}},
	216: {Name: "mremap", Description: "remaps a virtual memory region", Args: []ArgDef{{Name: "old_addr", Type: TypePtr}, {Name: "old_size", Type: TypeInt}, {Name: "new_size", Type: TypeInt}, {Name: "flags", Type: TypeInt}}},
	220: {Name: "clone", Description: "creates a new thread or process", Args: []ArgDef{{Name: "flags", Type: TypeInt}, {Name: "stack", Type: TypePtr}, {Name: "parent_tid", Type: TypePtr}, {Name: "tls", Type: TypePtr}, {Name: "child_tid", Type: TypePtr}}},
	221: {Name: "execve", Description: "replaces the calling process image with a new program", Args: []ArgDef{{Name: "pathname", Type: TypeString}, {Name: "argv", Type: TypePtr}, {Name: "envp", Type: TypePtr}}},
	222: {Name: "mmap", Description: "maps a file or anonymous memory into the process address space", Args: []ArgDef{{Name: "addr", Type: TypePtr}, {Name: "length", Type: TypeInt}, {Name: "prot", Type: TypeInt}, {Name: "flags", Type: TypeInt}, {Name: "fd", Type: TypeInt}, {Name: "offset", Type: TypeInt}}},
	226: {Name: "mprotect", Description: "sets memory access protections on a region", Args: []ArgDef{{Name: "addr", Type: TypePtr}, {Name: "len", Type: TypeInt}, {Name: "prot", Type: TypeInt}}},
	233: {Name: "madvise", Description: "gives advice about memory usage patterns", Args: []ArgDef{{Name: "addr", Type: TypePtr}, {Name: "length", Type: TypeInt}, {Name: "advice", Type: TypeInt}}},
	261: {Name: "prlimit64", Description: "gets/sets process resource limits", Args: []ArgDef{{Name: "pid", Type: TypeInt}, {Name: "resource", Type: TypeInt}, {Name: "new_limit", Type: TypePtr}, {Name: "old_limit", Type: TypePtr}}},
	278: {Name: "getrandom", Description: "fills a buffer with random bytes from the kernel", Args: []ArgDef{{Name: "buf", Type: TypePtr}, {Name: "buflen", Type: TypeInt}, {Name: "flags", Type: TypeInt}}},
	291: {Name: "statx", Description: "retrieves extended file metadata", Args: []ArgDef{{Name: "dirfd", Type: TypeInt}, {Name: "pathname", Type: TypeString}, {Name: "flags", Type: TypeInt}, {Name: "mask", Type: TypeInt}, {Name: "statxbuf", Type: TypePtr}}},
	293: {Name: "rseq", Description: "registers restartable sequences for efficient user-space ops", Args: []ArgDef{{Name: "rseq", Type: TypePtr}, {Name: "rseq_len", Type: TypeInt}, {Name: "flags", Type: TypeInt}, {Name: "sig", Type: TypeInt}}},
}

func GetDef(num uint64) SyscallDef {
	if def, ok := Table[num]; ok {
		return def
	}
	return SyscallDef{Name: "unknown", Description: "unmapped syscall"}
}
