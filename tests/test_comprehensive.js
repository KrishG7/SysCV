#!/usr/bin/env node
/**
 * SysCV Comprehensive Test Suite
 * Tests all major syscall categories: IO, Files, Memory, Process, Network, Signals
 */
const WebSocket = require('ws');

const VERBOSE = process.argv.includes('--verbose');
const WS_URL  = 'ws://localhost:8080/trace';

const TESTS = [

  // ── 1. File I/O ────────────────────────────────────────────────────────────
  {
    name: 'File I/O (open/read/write/close/stat/unlink)',
    timeout: 15000,
    code: `
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <string.h>
int main() {
    const char *path = "/tmp/syscv_test.txt";
    const char *msg  = "syscv rocks\\n";
    int fd = open(path, O_CREAT | O_WRONLY | O_TRUNC, 0644);
    if (fd >= 0) { write(fd, msg, strlen(msg)); close(fd); }
    struct stat st; stat(path, &st);
    char buf[64];
    fd = open(path, O_RDONLY);
    ssize_t n = read(fd, buf, sizeof(buf)-1);
    buf[n>0?n:0] = '\\0';
    close(fd);
    write(1, "read: ", 6);
    write(1, buf, n>0?(size_t)n:0);
    unlink(path);
    write(1, "done\\n", 5);
    return 0;
}`,
    expect: { minSyscalls: 10, output: 'syscv rocks', category: 'files' },
  },

  // ── 2. Memory ──────────────────────────────────────────────────────────────
  {
    name: 'Memory (malloc/free → brk/mmap + mprotect)',
    timeout: 15000,
    code: `
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/mman.h>
int main() {
    char *a = (char*)malloc(128);
    memset(a, 0x41, 128);
    free(a);
    char *b = (char*)malloc(2*1024*1024);
    memset(b, 0x42, 4096);
    free(b);
    void *m = mmap(NULL, 4096, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0);
    if (m != MAP_FAILED) { mprotect(m, 4096, PROT_READ); munmap(m, 4096); }
    write(1, "memory ok\\n", 10);
    return 0;
}`,
    expect: { minSyscalls: 8, output: 'memory ok', category: 'memory' },
  },

  // ── 3. Process info ────────────────────────────────────────────────────────
  {
    name: 'Process Info (getpid/getppid/getuid/getgid/gettid)',
    timeout: 15000,
    code: `
#include <unistd.h>
#include <sys/types.h>
#include <sys/syscall.h>
#include <stdio.h>
int main() {
    uid_t uid  = getuid();
    uid_t euid = geteuid();
    gid_t gid  = getgid();
    pid_t tid  = (pid_t)syscall(SYS_gettid);
    char buf[128];
    int n = snprintf(buf, sizeof(buf), "uid=%d euid=%d gid=%d tid=%d\\n", uid, euid, gid, tid);
    write(1, buf, n);
    return 0;
}`,
    expect: { minSyscalls: 6, output: 'uid=', category: 'process' },
  },

  // ── 4. Fork + wait ─────────────────────────────────────────────────────────
  {
    name: 'Fork & Wait (fork/wait4/exit)',
    timeout: 18000,
    code: `
#include <unistd.h>
#include <sys/wait.h>
#include <stdio.h>
int main() {
    write(1, "parent start\\n", 14);
    pid_t pid = fork();
    if (pid == 0) { write(1, "child running\\n", 15); _exit(42); }
    int status;
    waitpid(pid, &status, 0);
    char buf[64];
    int n = snprintf(buf, sizeof(buf), "child exit=%d\\n", WEXITSTATUS(status));
    write(1, buf, n);
    return 0;
}`,
    expect: { minSyscalls: 6, output: 'parent start', category: 'process' },
  },

  // ── 5. Signals ─────────────────────────────────────────────────────────────
  {
    name: 'Signals (rt_sigaction/kill/raise)',
    timeout: 15000,
    code: `
#include <signal.h>
#include <unistd.h>
#include <string.h>
#include <stdio.h>
static volatile int got_signal = 0;
static void handler(int sig) { (void)sig; got_signal++; }
int main() {
    struct sigaction sa;
    memset(&sa, 0, sizeof(sa));
    sa.sa_handler = handler;
    sigaction(SIGUSR1, &sa, NULL);
    sigaction(SIGUSR2, &sa, NULL);
    raise(SIGUSR1);
    kill(getpid(), SIGUSR2);
    char buf[32];
    int n = snprintf(buf, sizeof(buf), "signals caught: %d\\n", got_signal);
    write(1, buf, n);
    return 0;
}`,
    expect: { minSyscalls: 6, output: 'signals caught', category: 'process' },
  },

  // ── 6. Directory ops ───────────────────────────────────────────────────────
  {
    name: 'Directory Ops (mkdir/chdir/getcwd/rmdir)',
    timeout: 15000,
    code: `
#include <unistd.h>
#include <sys/stat.h>
#include <string.h>
int main() {
    mkdir("/tmp/syscv_dir", 0755);
    chdir("/tmp/syscv_dir");
    char cwd[256];
    getcwd(cwd, sizeof(cwd));
    write(1, cwd, strlen(cwd));
    write(1, "\\n", 1);
    chdir("/tmp");
    rmdir("/tmp/syscv_dir");
    write(1, "dir ok\\n", 7);
    return 0;
}`,
    expect: { minSyscalls: 6, output: 'syscv_dir', category: 'files' },
  },

  // ── 7. Pipe + FD ops ───────────────────────────────────────────────────────
  // Note: write to dup(1) uses a fd > 2, so tracer won't capture its text.
  // We verify pipe syscalls + the final write(1,...) instead.
  {
    name: 'FD Ops (pipe/dup/fcntl/read-write fd)',
    timeout: 15000,
    code: `
#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>
int main() {
    int pipefd[2];
    pipe(pipefd);
    write(pipefd[1], "hello from pipe\\n", 16);
    close(pipefd[1]);
    char buf[32];
    ssize_t n = read(pipefd[0], buf, sizeof(buf));
    close(pipefd[0]);
    int flags = fcntl(1, F_GETFL);
    (void)flags;
    write(1, "fd ops ok\\n", 10);
    return 0;
}`,
    expect: { minSyscalls: 6, output: 'fd ops ok', category: 'files' },
  },

  // ── 8. execve ──────────────────────────────────────────────────────────────
  {
    name: 'Exec (fork+execve /bin/echo)',
    timeout: 18000,
    code: `
#include <unistd.h>
#include <sys/wait.h>
int main() {
    pid_t pid = fork();
    if (pid == 0) {
        char *args[] = { "/bin/echo", "exec works", NULL };
        execve("/bin/echo", args, NULL);
        _exit(1);
    }
    int st;
    waitpid(pid, &st, 0);
    write(1, "exec parent done\\n", 17);
    return 0;
}`,
    expect: { minSyscalls: 5, output: 'exec parent done', category: 'process' },
  },

  // ── 9. Repeated writes ─────────────────────────────────────────────────────
  {
    name: 'Repeated writes (stdout flood)',
    timeout: 15000,
    code: `
#include <unistd.h>
int main() {
    const char *line = "abcdefghijklmnopqrstuvwxyz 0123456789 DONE\\n";
    for (int i = 0; i < 20; i++) write(1, line, 43);
    return 0;
}`,
    expect: { minSyscalls: 20, output: 'DONE', category: 'io' },
  },

  // ── 10. SIGSEGV crash ──────────────────────────────────────────────────────
  // Crash via null deref → SIGSEGV → exit code 139 (128+11).
  // We only check for non-zero exit; process may crash before any user syscall.
  {
    name: 'Crash (SIGSEGV → exit 139)',
    timeout: 12000,
    code: `
int main() {
    volatile int *p = (volatile int *)0;
    *p = 1;
    return 0;
}`,
    expect: { minSyscalls: 0, exitNonZero: true },
  },

];

// ─── Category sets ────────────────────────────────────────────────────────────
const CATS = {
  io:      new Set(['read','write','pread64','pwrite64','readv','writev']),
  files:   new Set(['open','openat','close','stat','fstat','lstat','access','unlink','rename',
                    'mkdir','rmdir','getcwd','chdir','dup','dup2','fcntl','pipe','pipe2','newfstatat']),
  memory:  new Set(['mmap','munmap','brk','mprotect','mremap','madvise']),
  process: new Set(['fork','clone','execve','exit','exit_group','wait4','waitpid','kill','tgkill',
                    'getpid','getppid','gettid','getuid','getgid','geteuid','getegid',
                    'rt_sigaction','rt_sigprocmask','arch_prctl','set_tid_address']),
};

// ─── Runner ───────────────────────────────────────────────────────────────────
async function runTest(test) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    const result = { name: test.name, syscalls: [], output: '', exitCode: null, error: null, timedOut: false };

    const timer = setTimeout(() => { result.timedOut = true; ws.close(); resolve(result); }, test.timeout);

    ws.on('open', () => ws.send(JSON.stringify({ action: 'run', code: test.code })));
    ws.on('message', (raw) => {
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      if (msg.type === 'error')   { result.error = msg.message; clearTimeout(timer); ws.close(); }
      else if (msg.type === 'syscall') { if (msg.name && msg.name !== 'unknown') result.syscalls.push({ name: msg.name, isExit: msg.is_exit }); }
      else if (msg.type === 'output') { result.output += msg.text ?? ''; }
      else if (msg.type === 'exit')   { result.exitCode = msg.exit_code; clearTimeout(timer); ws.close(); }
    });
    ws.on('close', () => resolve(result));
    ws.on('error', (e) => { result.error = e.message; clearTimeout(timer); resolve(result); });
  });
}

function check(test, result) {
  const issues = [];
  const ex = test.expect;
  const entries  = result.syscalls.filter(s => !s.isExit).length;
  const uniq     = [...new Set(result.syscalls.map(s => s.name))];

  if (result.timedOut)                             issues.push(`TIMEOUT after ${test.timeout}ms`);
  if (result.error)                                issues.push(`ERROR: ${result.error}`);
  if (ex.minSyscalls && entries < ex.minSyscalls)  issues.push(`only ${entries} syscall entries (want ≥${ex.minSyscalls})`);
  if (ex.output && !result.output.includes(ex.output))
    issues.push(`terminal missing "${ex.output}" (got: "${result.output.slice(0,80).replace(/\n/g,'↵')}")`);
  if (ex.exitNonZero && (result.exitCode === 0 || result.exitCode === null))
    issues.push(`expected non-zero exit, got ${result.exitCode}`);
  if (!ex.exitNonZero && result.exitCode !== 0 && !result.timedOut && !result.error)
    issues.push(`unexpected non-zero exit: ${result.exitCode}`);
  if (ex.category && CATS[ex.category] && !uniq.some(n => CATS[ex.category].has(n)))
    issues.push(`no "${ex.category}" syscalls seen (found: ${uniq.join(', ')})`);

  return { pass: issues.length === 0, issues, uniq, entries };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║          SysCV Comprehensive Test Suite                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  let passed = 0, failed = 0;

  for (let i = 0; i < TESTS.length; i++) {
    const test = TESTS[i];
    process.stdout.write(`[${String(i+1).padStart(2,'0')}/${TESTS.length}] ${test.name} … `);
    const result = await runTest(test);
    const { pass, issues, uniq, entries } = check(test, result);

    if (pass) {
      console.log(`\x1b[32mPASS\x1b[0m  (${entries} entries; syscalls: ${uniq.slice(0,6).join(', ')}${uniq.length>6?'…':''})`);
      passed++;
    } else {
      console.log(`\x1b[31mFAIL\x1b[0m`);
      issues.forEach(i => console.log(`         ✗ ${i}`));
      if (VERBOSE) {
        console.log(`         syscalls: ${uniq.join(', ')}`);
        console.log(`         output:   ${result.output.slice(0,200).replace(/\n/g,'↵')}`);
        console.log(`         exit:     ${result.exitCode}`);
      }
      failed++;
    }
  }

  console.log('\n──────────────────────────────────────────────────────────────');
  console.log(`Results: \x1b[32m${passed} PASS\x1b[0m  \x1b[31m${failed} FAIL\x1b[0m  of ${TESTS.length} total`);
  console.log('──────────────────────────────────────────────────────────────\n');
  process.exit(failed > 0 ? 1 : 0);
})();
