//go:build linux && amd64
package syscalls

var Table = map[uint64]SyscallDef{
	// ── Core I/O ──────────────────────────────
	0: {Name: "read", Description: "reads bytes from a file descriptor into a buffer", Args: []ArgDef{
		{Name: "fd", Type: TypeInt}, {Name: "buf", Type: TypePtr}, {Name: "count", Type: TypeInt},
	}},
	1: {Name: "write", Description: "writes bytes from a buffer to a file descriptor", Args: []ArgDef{
		{Name: "fd", Type: TypeInt}, {Name: "buf", Type: TypeString}, {Name: "count", Type: TypeInt},
	}},
	2: {Name: "open", Description: "opens a file and returns a file descriptor", Args: []ArgDef{
		{Name: "pathname", Type: TypeString}, {Name: "flags", Type: TypeInt}, {Name: "mode", Type: TypeInt},
	}},
	3:   {Name: "close", Description: "closes a file descriptor, freeing the resource", Args: []ArgDef{{Name: "fd", Type: TypeInt}}},
	4:   {Name: "stat", Description: "retrieves file metadata by path", Args: []ArgDef{{Name: "pathname", Type: TypeString}, {Name: "statbuf", Type: TypePtr}}},
	5:   {Name: "fstat", Description: "retrieves file metadata by file descriptor", Args: []ArgDef{{Name: "fd", Type: TypeInt}, {Name: "statbuf", Type: TypePtr}}},
	6:   {Name: "lstat", Description: "retrieves file metadata (follows symlinks)", Args: []ArgDef{{Name: "pathname", Type: TypeString}, {Name: "statbuf", Type: TypePtr}}},
	7:   {Name: "poll", Description: "waits for events on a set of file descriptors", Args: []ArgDef{{Name: "fds", Type: TypePtr}, {Name: "nfds", Type: TypeInt}, {Name: "timeout", Type: TypeInt}}},
	8:   {Name: "lseek", Description: "repositions the offset within a file descriptor", Args: []ArgDef{{Name: "fd", Type: TypeInt}, {Name: "offset", Type: TypeInt}, {Name: "whence", Type: TypeInt}}},
	9:   {Name: "mmap", Description: "maps a file or anonymous memory into the process address space", Args: []ArgDef{{Name: "addr", Type: TypePtr}, {Name: "length", Type: TypeInt}, {Name: "prot", Type: TypeInt}, {Name: "flags", Type: TypeInt}, {Name: "fd", Type: TypeInt}, {Name: "offset", Type: TypeInt}}},
	10:  {Name: "mprotect", Description: "sets memory access protections", Args: []ArgDef{{Name: "addr", Type: TypePtr}, {Name: "len", Type: TypeInt}, {Name: "prot", Type: TypeInt}}},
	11:  {Name: "munmap", Description: "unmaps memory from the process address space", Args: []ArgDef{{Name: "addr", Type: TypePtr}, {Name: "length", Type: TypeInt}}},
	12:  {Name: "brk", Description: "adjusts the top of the data segment (heap boundary)", Args: []ArgDef{{Name: "brk", Type: TypePtr}}},
	13:  {Name: "rt_sigaction", Description: "reads or changes a signal handler", Args: []ArgDef{{Name: "signum", Type: TypeInt}, {Name: "act", Type: TypePtr}, {Name: "oldact", Type: TypePtr}}},
	14:  {Name: "rt_sigprocmask", Description: "sets or reads the signal mask", Args: []ArgDef{{Name: "how", Type: TypeInt}, {Name: "set", Type: TypePtr}, {Name: "oldset", Type: TypePtr}}},
	16:  {Name: "ioctl", Description: "performs device-specific control operations on a file descriptor", Args: []ArgDef{{Name: "fd", Type: TypeInt}, {Name: "request", Type: TypeInt}, {Name: "argp", Type: TypePtr}}},
	17:  {Name: "pread64", Description: "reads bytes at a given offset without changing the file position", Args: []ArgDef{{Name: "fd", Type: TypeInt}, {Name: "buf", Type: TypePtr}, {Name: "count", Type: TypeInt}, {Name: "offset", Type: TypeInt}}},
	18:  {Name: "pwrite64", Description: "writes bytes at a given offset without changing the file position", Args: []ArgDef{{Name: "fd", Type: TypeInt}, {Name: "buf", Type: TypeString}, {Name: "count", Type: TypeInt}, {Name: "offset", Type: TypeInt}}},
	19:  {Name: "readv", Description: "reads into multiple buffers (scatter input)", Args: []ArgDef{{Name: "fd", Type: TypeInt}, {Name: "iov", Type: TypePtr}, {Name: "iovcnt", Type: TypeInt}}},
	20:  {Name: "writev", Description: "writes from multiple buffers (gather output)", Args: []ArgDef{{Name: "fd", Type: TypeInt}, {Name: "iov", Type: TypePtr}, {Name: "iovcnt", Type: TypeInt}}},
	21:  {Name: "access", Description: "checks whether a file can be accessed with given permissions", Args: []ArgDef{{Name: "pathname", Type: TypeString}, {Name: "mode", Type: TypeInt}}},
	32:  {Name: "dup", Description: "duplicates a file descriptor", Args: []ArgDef{{Name: "oldfd", Type: TypeInt}}},
	33:  {Name: "dup2", Description: "duplicates a file descriptor to a specific number", Args: []ArgDef{{Name: "oldfd", Type: TypeInt}, {Name: "newfd", Type: TypeInt}}},
	39:  {Name: "getpid", Description: "returns the process ID of the calling process", Args: []ArgDef{}},
	41:  {Name: "socket", Description: "creates a network socket endpoint", Args: []ArgDef{{Name: "domain", Type: TypeInt}, {Name: "type", Type: TypeInt}, {Name: "protocol", Type: TypeInt}}},
	42:  {Name: "connect", Description: "initiates a connection on a socket", Args: []ArgDef{{Name: "sockfd", Type: TypeInt}, {Name: "addr", Type: TypePtr}, {Name: "addrlen", Type: TypeInt}}},
	43:  {Name: "accept", Description: "accepts an incoming connection on a socket", Args: []ArgDef{{Name: "sockfd", Type: TypeInt}, {Name: "addr", Type: TypePtr}, {Name: "addrlen", Type: TypePtr}}},
	44:  {Name: "sendto", Description: "sends data on a socket", Args: []ArgDef{{Name: "sockfd", Type: TypeInt}, {Name: "buf", Type: TypeString}, {Name: "len", Type: TypeInt}, {Name: "flags", Type: TypeInt}}},
	45:  {Name: "recvfrom", Description: "receives data from a socket", Args: []ArgDef{{Name: "sockfd", Type: TypeInt}, {Name: "buf", Type: TypePtr}, {Name: "len", Type: TypeInt}, {Name: "flags", Type: TypeInt}}},
	57:  {Name: "fork", Description: "creates a new child process by duplicating the parent", Args: []ArgDef{}},
	59:  {Name: "execve", Description: "replaces the calling process image with a new program", Args: []ArgDef{{Name: "pathname", Type: TypeString}, {Name: "argv", Type: TypePtr}, {Name: "envp", Type: TypePtr}}},
	60:  {Name: "exit", Description: "terminates the calling process with a status code", Args: []ArgDef{{Name: "status", Type: TypeInt}}},
	61:  {Name: "wait4", Description: "waits for a child process to change state", Args: []ArgDef{{Name: "pid", Type: TypeInt}, {Name: "wstatus", Type: TypePtr}, {Name: "options", Type: TypeInt}}},
	62:  {Name: "kill", Description: "sends a signal to a process", Args: []ArgDef{{Name: "pid", Type: TypeInt}, {Name: "sig", Type: TypeInt}}},
	72:  {Name: "fcntl", Description: "manipulates a file descriptor (flags, locking, etc.)", Args: []ArgDef{{Name: "fd", Type: TypeInt}, {Name: "cmd", Type: TypeInt}, {Name: "arg", Type: TypeInt}}},
	79:  {Name: "getcwd", Description: "gets the current working directory path", Args: []ArgDef{{Name: "buf", Type: TypePtr}, {Name: "size", Type: TypeInt}}},
	80:  {Name: "chdir", Description: "changes the current working directory", Args: []ArgDef{{Name: "path", Type: TypeString}}},
	82:  {Name: "rename", Description: "renames a file or directory", Args: []ArgDef{{Name: "oldpath", Type: TypeString}, {Name: "newpath", Type: TypeString}}},
	83:  {Name: "mkdir", Description: "creates a directory", Args: []ArgDef{{Name: "pathname", Type: TypeString}, {Name: "mode", Type: TypeInt}}},
	84:  {Name: "rmdir", Description: "removes an empty directory", Args: []ArgDef{{Name: "pathname", Type: TypeString}}},
	85:  {Name: "creat", Description: "creates a new file or truncates an existing one", Args: []ArgDef{{Name: "pathname", Type: TypeString}, {Name: "mode", Type: TypeInt}}},
	87:  {Name: "unlink", Description: "removes a file (decrements hard link count)", Args: []ArgDef{{Name: "pathname", Type: TypeString}}},
	102: {Name: "getuid", Description: "returns the real user ID of the calling process", Args: []ArgDef{}},
	104: {Name: "getgid", Description: "returns the real group ID of the calling process", Args: []ArgDef{}},
	107: {Name: "geteuid", Description: "returns the effective user ID of the calling process", Args: []ArgDef{}},
	108: {Name: "getegid", Description: "returns the effective group ID of the calling process", Args: []ArgDef{}},
	110: {Name: "getppid", Description: "returns the PID of the caller's parent process", Args: []ArgDef{}},
	137: {Name: "statfs", Description: "returns filesystem statistics", Args: []ArgDef{{Name: "path", Type: TypeString}, {Name: "buf", Type: TypePtr}}},
	158: {Name: "arch_prctl", Description: "sets architecture-specific thread state (e.g., TLS base)", Args: []ArgDef{{Name: "code", Type: TypeInt}, {Name: "addr", Type: TypePtr}}},
	186: {Name: "gettid", Description: "returns the thread ID of the calling thread", Args: []ArgDef{}},
	202: {Name: "futex", Description: "fast user-space mutex (blocking synchronization primitive)", Args: []ArgDef{{Name: "uaddr", Type: TypePtr}, {Name: "futex_op", Type: TypeInt}, {Name: "val", Type: TypeInt}}},
	218: {Name: "set_tid_address", Description: "sets the pointer to the thread ID (for thread cleanup)", Args: []ArgDef{{Name: "tidptr", Type: TypePtr}}},
	228: {Name: "clock_gettime", Description: "reads the current time from a clock", Args: []ArgDef{{Name: "clockid", Type: TypeInt}, {Name: "tp", Type: TypePtr}}},
	230: {Name: "clock_nanosleep", Description: "sleeps for a high-resolution interval", Args: []ArgDef{{Name: "clockid", Type: TypeInt}, {Name: "flags", Type: TypeInt}, {Name: "request", Type: TypePtr}}},
	231: {Name: "exit_group", Description: "terminates all threads in the process", Args: []ArgDef{{Name: "status", Type: TypeInt}}},
	234: {Name: "tgkill", Description: "sends a signal to a specific thread", Args: []ArgDef{{Name: "tgid", Type: TypeInt}, {Name: "tid", Type: TypeInt}, {Name: "sig", Type: TypeInt}}},
	257: {Name: "openat", Description: "opens a file relative to a directory file descriptor", Args: []ArgDef{{Name: "dirfd", Type: TypeInt}, {Name: "pathname", Type: TypeString}, {Name: "flags", Type: TypeInt}, {Name: "mode", Type: TypeInt}}},
	262: {Name: "newfstatat", Description: "retrieves file metadata relative to a directory fd", Args: []ArgDef{{Name: "dirfd", Type: TypeInt}, {Name: "pathname", Type: TypeString}, {Name: "statbuf", Type: TypePtr}, {Name: "flags", Type: TypeInt}}},
	302: {Name: "prlimit64", Description: "gets/sets process resource limits", Args: []ArgDef{{Name: "pid", Type: TypeInt}, {Name: "resource", Type: TypeInt}, {Name: "new_limit", Type: TypePtr}, {Name: "old_limit", Type: TypePtr}}},
	318: {Name: "getrandom", Description: "fills a buffer with random bytes from the kernel", Args: []ArgDef{{Name: "buf", Type: TypePtr}, {Name: "buflen", Type: TypeInt}, {Name: "flags", Type: TypeInt}}},
	332: {Name: "statx", Description: "retrieves extended file metadata", Args: []ArgDef{{Name: "dirfd", Type: TypeInt}, {Name: "pathname", Type: TypeString}, {Name: "flags", Type: TypeInt}, {Name: "mask", Type: TypeInt}, {Name: "statxbuf", Type: TypePtr}}},
	334: {Name: "rseq", Description: "registers restartable sequences for efficient user-space operations", Args: []ArgDef{{Name: "rseq", Type: TypePtr}, {Name: "rseq_len", Type: TypeInt}, {Name: "flags", Type: TypeInt}, {Name: "sig", Type: TypeInt}}},
}

func GetDef(num uint64) SyscallDef {
	if def, ok := Table[num]; ok {
		return def
	}
	return SyscallDef{Name: "unknown", Description: "unmapped syscall"}
}
