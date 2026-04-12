import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import SyscallCanvas from './components/SyscallCanvas';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SyscallArg { name: string; type: string; raw_value: number; str_value?: string; }
interface SyscallEvent {
  type: 'syscall' | 'exit' | 'error' | 'output';
  name?: string; description?: string; number?: number;
  args?: SyscallArg[]; ret?: number; is_exit?: boolean;
  exit_code?: number; exit_signal?: number; message?: string; text?: string;
}
interface Step { index: number; enter: SyscallEvent; exit?: SyscallEvent; }
type Phase = 'idle' | 'collecting' | 'replay';

// ─── Examples ─────────────────────────────────────────────────────────────────
const EXAMPLES = [
  {
    id: 'file_io', label: 'File I/O', desc: 'open / write / close a file',
    code: `#include <unistd.h>\n#include <fcntl.h>\n\nint main() {\n    write(1, "Hello from SysCV!\\n", 19);\n\n    int fd = open("/tmp/syscv.txt", O_CREAT | O_WRONLY | O_TRUNC, 0644);\n    if (fd >= 0) {\n        write(fd, "written to file\\n", 16);\n        close(fd);\n    }\n    return 0;\n}`,
  },
  {
    id: 'printf', label: 'Hello World', desc: 'printf to stdout',
    code: `#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    printf("SysCV makes syscalls visible\\n");\n    fflush(stdout);\n    return 0;\n}`,
  },
  {
    id: 'fork', label: 'Fork', desc: 'fork() — parent trace only',
    code: `#include <unistd.h>\n#include <sys/wait.h>\n\nint main() {\n    write(1, "before fork\\n", 13);\n    pid_t pid = fork();\n    if (pid == 0) {\n        /* child: detached by tracer, runs freely */\n        _exit(0);\n    }\n    /* parent: wait for child then continue */\n    int status;\n    waitpid(pid, &status, 0);\n    write(1, "parent done\\n", 13);\n    return 0;\n}`,
  },
  {
    id: 'malloc', label: 'Heap', desc: 'malloc/free → brk / mmap',
    code: `#include <stdlib.h>\n#include <string.h>\n#include <unistd.h>\n\nint main() {\n    char *buf = (char *)malloc(4096);\n    memset(buf, 65, 4096);\n    write(1, "allocated 4096 bytes\\n", 22);\n    free(buf);\n    write(1, "freed\\n", 7);\n    return 0;\n}`,
  },
  {
    id: 'pinfo', label: 'Process Info', desc: 'getpid / getppid / getuid',
    code: `#include <unistd.h>\n#include <sys/types.h>\n\nint main() {\n    pid_t pid  = getpid();\n    pid_t ppid = getppid();\n    uid_t uid  = getuid();\n    (void)pid; (void)ppid; (void)uid;\n    write(1, "process info read\\n", 19);\n    return 0;\n}`,
  },
];

// ─── Categories ───────────────────────────────────────────────────────────────
const CAT_IO      = new Set(['read','write','pread64','pwrite64','readv','writev','sendto','recvfrom']);
const CAT_FILES   = new Set(['open','openat','close','stat','fstat','lstat','access','unlink','rename','mkdir','rmdir','creat','newfstatat','statx','readlinkat','getcwd','chdir','dup','dup2','fcntl']);
const CAT_MEMORY  = new Set(['mmap','munmap','brk','mprotect','mremap','madvise']);
const CAT_PROCESS = new Set(['fork','clone','execve','exit','exit_group','wait4','kill','tgkill','getpid','getppid','gettid','getuid','getgid','geteuid','getegid','arch_prctl','set_tid_address','futex','rseq','prlimit64','getrandom','rt_sigaction','rt_sigprocmask']);

function getCategory(name: string) {
  if (CAT_IO.has(name))      return 'io';
  if (CAT_FILES.has(name))   return 'files';
  if (CAT_MEMORY.has(name))  return 'memory';
  if (CAT_PROCESS.has(name)) return 'process';
  return 'other';
}
const CAT_COLOR: Record<string,string> = {
  io:'#3fb950', files:'#bc8cff', memory:'#f0883e', process:'#58a6ff', other:'#6e7681',
};
const syscallColor = (n: string) => CAT_COLOR[getCategory(n)] ?? CAT_COLOR.other;

// ─── Step builder — filters unknown (dynamic linker noise) ────────────────────
function buildSteps(events: SyscallEvent[]): Step[] {
  const steps: Step[] = [];
  const pending: SyscallEvent[] = [];
  for (const ev of events) {
    if (ev.type !== 'syscall') continue;
    if (!ev.name || ev.name === 'unknown') continue; // skip unmapped ld-linux noise
    if (!ev.is_exit) {
      pending.push(ev);
    } else {
      const ri = [...pending].reverse().findIndex(p => p.name === ev.name);
      if (ri !== -1) {
        const i = pending.length - 1 - ri;
        steps.push({ index: steps.length, enter: pending.splice(i,1)[0], exit: ev });
      } else {
        steps.push({ index: steps.length, enter: ev });
      }
    }
  }
  for (const p of pending) steps.push({ index: steps.length, enter: p });
  return steps;
}

// ─── Resize Handle ────────────────────────────────────────────────────────────
function ResizeHandle({ dir, onMouseDown }: {
  dir: 'v' | 'h';
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseDown={e => { e.preventDefault(); onMouseDown(e); }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flexShrink: 0,
        width:  dir === 'v' ? '5px' : '100%',
        height: dir === 'h' ? '5px' : '100%',
        background: hov ? '#58a6ff70' : '#21262d',
        cursor: dir === 'v' ? 'col-resize' : 'row-resize',
        transition: 'background 0.15s',
        zIndex: 20,
      }}
    />
  );
}

// ─── Step Item ────────────────────────────────────────────────────────────────
function StepItem({ step, isSelected, onClick, scrollRef }: {
  step: Step; isSelected: boolean; onClick: () => void; scrollRef?: React.Ref<HTMLDivElement>;
}) {
  const name  = step.enter.name ?? '?';
  const color = syscallColor(name);
  const ret   = step.exit?.ret;
  const isErr = ret !== undefined && ret < 0;

  const preview = useMemo(() => {
    const a = step.enter.args;
    if (!a?.length) return '';
    const p = a.slice(0,2).map(x =>
      x.str_value
        ? `"${x.str_value.slice(0,14)}${x.str_value.length > 14 ? '…' : ''}"`
        : String(x.raw_value)
    );
    return p.join(', ') + (a.length > 2 ? ',…' : '');
  }, [step]);

  return (
    <div
      ref={scrollRef}
      onClick={onClick}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#ffffff08'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
      style={{
        cursor: 'pointer',
        borderLeft: `3px solid ${isSelected ? color : 'transparent'}`,
        background: isSelected ? `${color}14` : 'transparent',
        borderBottom: '1px solid #1c2128',
        transition: 'background 0.1s, border-color 0.1s',
      }}
    >
      {/* ── compact row ── */}
      <div style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 10px 8px 8px' }}>
        <span style={{ fontFamily:'monospace', fontSize:'10px', color:'#6e7681', minWidth:'22px', textAlign:'right', flexShrink:0 }}>
          {step.index + 1}
        </span>
        <span style={{ fontFamily:'JetBrains Mono, monospace', fontSize:'12px', fontWeight:700, color: isSelected ? color : '#e6edf3', minWidth:'86px', flexShrink:0 }}>
          {name}
        </span>
        <span style={{ fontFamily:'monospace', fontSize:'11px', color:'#8b949e', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {preview}
        </span>
        {ret !== undefined && (
          <span style={{ fontFamily:'monospace', fontSize:'11px', fontWeight:700, color: isErr ? '#f85149' : '#3fb950', flexShrink:0, minWidth:'28px', textAlign:'right' }}>
            {ret}
          </span>
        )}
      </div>

      {/* ── expanded detail ── */}
      {isSelected && (
        <div style={{ padding:'0 12px 12px 39px', borderTop:`1px solid ${color}22` }}>
          {step.enter.args && step.enter.args.length > 0 && (
            <div style={{ marginTop:'10px', display:'flex', flexDirection:'column', gap:'6px' }}>
              {step.enter.args.map(a => (
                <div key={a.name} style={{ display:'grid', gridTemplateColumns:'72px 76px 1fr', gap:'6px', alignItems:'baseline' }}>
                  <span style={{ fontFamily:'monospace', fontSize:'10px', color:'#8b949e' }}>{a.type}</span>
                  <span style={{ fontFamily:'monospace', fontSize:'12px', color:'#c9d1d9', fontWeight:600 }}>{a.name}</span>
                  <span style={{ fontFamily:'monospace', fontSize:'12px', wordBreak:'break-all' }}>
                    {a.str_value
                      ? <span style={{ color:'#79c0ff' }}>"{a.str_value}"</span>
                      : <span style={{ color:'#e3b341' }}>{a.raw_value}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          {ret !== undefined && (
            <div style={{ marginTop:'10px', paddingTop:'8px', borderTop:'1px solid #30363d', display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ fontFamily:'monospace', fontSize:'10px', color:'#8b949e' }}>returns</span>
              <span style={{ fontFamily:'monospace', fontSize:'13px', fontWeight:700, color: isErr ? '#f85149' : '#3fb950' }}>
                {ret}{isErr ? '  (error)' : ''}
              </span>
            </div>
          )}
          {step.enter.description && (
            <p style={{ marginTop:'8px', fontSize:'12px', color:'#8b949e', fontStyle:'italic', lineHeight:1.6, margin:'8px 0 0' }}>
              {step.enter.description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [code, setCode]                   = useState(EXAMPLES[0].code);
  const [phase, setPhase]                 = useState<Phase>('idle');
  const [isConnected, setIsConnected]     = useState(false);
  const [steps, setSteps]                 = useState<Step[]>([]);
  const [selectedStep, setSelectedStep]   = useState(0);
  const [exitCode, setExitCode]           = useState<number | null>(null);
  const [compileError, setCompileError]   = useState<string | null>(null);
  const [terminalText, setTerminalText]   = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [showExamples, setShowExamples]   = useState(false);

  // ── Resizable panels ───────────────────────────────────────────────────────
  const [leftWidth, setLeftWidth]       = useState(320);
  const [rightWidth, setRightWidth]     = useState(280);
  const [bottomHeight, setBottomHeight] = useState(210);

  const drag = useRef<{ type:'left'|'right'|'bottom'; startX:number; startY:number; startVal:number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      if (d.type === 'left')        setLeftWidth(Math.max(0,   d.startVal + (e.clientX - d.startX)));
      else if (d.type === 'right')  setRightWidth(Math.max(0,  d.startVal - (e.clientX - d.startX)));
      else                          setBottomHeight(Math.max(0, d.startVal - (e.clientY - d.startY)));
    };
    const onUp = () => {
      drag.current = null;
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  const startDrag = (type: 'left'|'right'|'bottom', e: React.MouseEvent) => {
    drag.current = { type, startX: e.clientX, startY: e.clientY, startVal: type === 'left' ? leftWidth : type === 'right' ? rightWidth : bottomHeight };
    document.body.style.cursor     = type === 'bottom' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // ── Refs ──────────────────────────────────────────────────────────────────
  const wsRef          = useRef<WebSocket | null>(null);
  const collectRef     = useRef<SyscallEvent[]>([]);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const termRef        = useRef<HTMLDivElement>(null);
  const selectedRef    = useRef<HTMLDivElement>(null);
  const examplesRef    = useRef<HTMLDivElement>(null);

  useEffect(() => { termRef.current?.scrollTo({ top: 99999, behavior:'smooth' }); }, [terminalText]);
  useEffect(() => { selectedRef.current?.scrollIntoView({ behavior:'smooth', block:'nearest' }); }, [selectedStep]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (examplesRef.current && !examplesRef.current.contains(e.target as Node)) setShowExamples(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Filtered steps & keyboard nav ─────────────────────────────────────────
  const filteredSteps = useMemo(() => {
    if (activeCategory === 'all') return steps;
    return steps.filter(s => getCategory(s.enter.name ?? '') === activeCategory);
  }, [steps, activeCategory]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (phase !== 'replay') return;
      if (e.key === 'ArrowDown'  || e.key === 'ArrowRight') { e.preventDefault(); setSelectedStep(s => Math.min(s+1, filteredSteps.length-1)); }
      if (e.key === 'ArrowUp'    || e.key === 'ArrowLeft')  { e.preventDefault(); setSelectedStep(s => Math.max(s-1, 0)); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [phase, filteredSteps.length]);

  const canvasEvents = useMemo(() => {
    if (phase !== 'replay' || !filteredSteps.length) return [];
    const upTo = filteredSteps[selectedStep];
    if (!upTo) return [];
    return steps.slice(0, upTo.index+1).flatMap(s => s.exit ? [s.enter, s.exit] : [s.enter]);
  }, [steps, filteredSteps, selectedStep, phase]);

  const catCounts = useMemo(() => {
    const c: Record<string,number> = { all: steps.length };
    steps.forEach(s => { const cat = getCategory(s.enter.name ?? ''); c[cat] = (c[cat] ?? 0) + 1; });
    return c;
  }, [steps]);

  // ── WebSocket — auto-reconnects every 2.5 s while offline ─────────────────
  const connectSocket = useCallback(() => {
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    if (wsRef.current) wsRef.current.close();

    const ws = new WebSocket('ws://localhost:8080/trace');
    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => {
      setIsConnected(false);
      setPhase(p => p === 'collecting' ? 'idle' : p);
      reconnectTimer.current = setTimeout(() => connectSocket(), 2500);
    };
    ws.onerror = () => setPhase(p => p === 'collecting' ? 'idle' : p);
    ws.onmessage = (msg) => {
      const data: SyscallEvent = JSON.parse(msg.data);
      if (data.type === 'output') { setTerminalText(t => t + (data.text ?? '')); return; }
      if (data.type === 'error')  {
        if (collectTimeoutRef.current) { clearTimeout(collectTimeoutRef.current); collectTimeoutRef.current = null; }
        setCompileError(data.message ?? 'error'); setPhase('idle'); return;
      }
      collectRef.current.push(data);
      if (data.type === 'exit') {
        if (collectTimeoutRef.current) { clearTimeout(collectTimeoutRef.current); collectTimeoutRef.current = null; }
        setSteps(buildSteps(collectRef.current));
        setSelectedStep(0); setActiveCategory('all');
        setExitCode(data.exit_code ?? 0); setPhase('replay');
      }
    };
    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connectSocket();
    return () => { if (reconnectTimer.current) clearTimeout(reconnectTimer.current); wsRef.current?.close(); };
  }, [connectSocket]);

  const collectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRun = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) { connectSocket(); setTimeout(handleRun, 600); return; }
    collectRef.current = [];
    setSteps([]); setSelectedStep(0); setExitCode(null); setCompileError(null);
    setTerminalText(''); setActiveCategory('all'); setPhase('collecting');

    // Safety timeout: if the backend never sends an exit event (e.g. process
    // hung or race condition), auto-reset after 30 seconds so the UI doesn't
    // freeze forever.
    if (collectTimeoutRef.current) clearTimeout(collectTimeoutRef.current);
    collectTimeoutRef.current = setTimeout(() => {
      setPhase(p => {
        if (p === 'collecting') {
          setCompileError('Trace timed out — the program may have hung. Try again.');
          return 'idle';
        }
        return p;
      });
    }, 30000);

    wsRef.current.send(JSON.stringify({ action:'run', code }));
  };

  const handleClear = () => {
    setSteps([]); setSelectedStep(0); setExitCode(null);
    setCompileError(null); setTerminalText(''); setPhase('idle');
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  const B = '1px solid #21262d';

  return (
    <div style={{ height:'100%', width:'100%', display:'flex', flexDirection:'column', background:'#0d1117', fontFamily:'Manrope, Inter, sans-serif', color:'#e6edf3', overflow:'hidden' }}>

      {/* ══ HEADER ════════════════════════════════════════════════════════════ */}
      <header style={{ height:'48px', flexShrink:0, display:'flex', alignItems:'center', gap:'12px', padding:'0 16px', background:'#161b22', borderBottom:B }}>

        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginRight:'4px' }}>
          <div style={{ width:'28px', height:'28px', borderRadius:'8px', background:'#3fb95018', border:'1px solid #3fb95035', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize:'16px', color:'#3fb950', fontVariationSettings:"'FILL' 1" }}>terminal</span>
          </div>
          <span style={{ fontFamily:'Space Grotesk, sans-serif', fontSize:'18px', fontWeight:900, color:'#3fb950', letterSpacing:'-0.5px', textShadow:'0 0 30px #3fb95050' }}>SysCV</span>
        </div>

        {phase === 'collecting' && (
          <div style={{ display:'flex', alignItems:'center', gap:'6px', padding:'3px 10px', borderRadius:'20px', background:'#e3b34118', border:'1px solid #e3b34128', fontSize:'11px', fontWeight:700, color:'#e3b341' }}>
            <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#e3b341', animation:'pulse 1s infinite' }} />
            TRACING
          </div>
        )}
        {phase === 'replay' && steps.length > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'3px 10px', borderRadius:'20px', background:'#3fb95012', border:'1px solid #3fb95022', fontSize:'11px', fontWeight:700, color:'#3fb950' }}>
            {steps.length} syscalls
            <span style={{ color: exitCode === 0 ? '#3fb950' : '#f85149' }}>· exit {exitCode}</span>
          </div>
        )}

        <div style={{ flex:1 }} />

        {/* Examples dropdown */}
        <div style={{ position:'relative' }} ref={examplesRef}>
          <button onClick={() => setShowExamples(v => !v)}
            style={{ display:'flex', alignItems:'center', gap:'6px', padding:'6px 12px', borderRadius:'8px', background:'#21262d', border:B, color:'#c9d1d9', fontSize:'12px', fontWeight:600, cursor:'pointer', fontFamily:'Space Grotesk, sans-serif' }}>
            <span className="material-symbols-outlined" style={{ fontSize:'14px', fontVariationSettings:"'FILL' 1" }}>collections_bookmark</span>
            Examples
            <span className="material-symbols-outlined" style={{ fontSize:'13px' }}>{showExamples ? 'expand_less' : 'expand_more'}</span>
          </button>
          {showExamples && (
            <div style={{ position:'absolute', right:0, top:'calc(100% + 4px)', width:'260px', background:'#161b22', border:B, borderRadius:'12px', boxShadow:'0 16px 40px #00000080', zIndex:50, overflow:'hidden' }}>
              <div style={{ padding:'8px 12px 6px', borderBottom:B }}>
                <span style={{ fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#6e7681' }}>Example Programs</span>
              </div>
              {EXAMPLES.map(ex => (
                <button key={ex.id}
                  onClick={() => { setCode(ex.code); setShowExamples(false); handleClear(); }}
                  style={{ width:'100%', textAlign:'left', padding:'10px 12px', background:'transparent', border:'none', borderBottom:B, cursor:'pointer', color:'inherit', transition:'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#ffffff0a')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ fontSize:'13px', fontWeight:700, color:'#e6edf3', fontFamily:'Space Grotesk, sans-serif' }}>{ex.label}</div>
                  <div style={{ fontSize:'11px', color:'#8b949e', marginTop:'2px' }}>{ex.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Run button */}
        <button id="btn-run" onClick={handleRun} disabled={phase === 'collecting'}
          style={{ display:'flex', alignItems:'center', gap:'6px', padding:'7px 18px', borderRadius:'8px', background:'#238636', border:'1px solid #2ea04360', color:'#fff', fontSize:'13px', fontWeight:700, cursor:'pointer', fontFamily:'Space Grotesk, sans-serif', boxShadow:'0 0 20px #23863640', opacity: phase === 'collecting' ? 0.5 : 1, transition:'opacity 0.15s' }}>
          <span className="material-symbols-outlined" style={{ fontSize:'17px', fontVariationSettings:"'FILL' 1" }}>
            {phase === 'collecting' ? 'hourglass_empty' : 'play_arrow'}
          </span>
          {phase === 'collecting' ? 'Running…' : 'Run'}
        </button>

        {phase === 'replay' && (
          <button onClick={handleClear}
            style={{ padding:'7px 12px', borderRadius:'8px', background:'#21262d', border:B, color:'#c9d1d9', fontSize:'12px', fontWeight:600, cursor:'pointer', fontFamily:'Space Grotesk, sans-serif' }}>
            Clear
          </button>
        )}

        {/* Connection indicator */}
        <div style={{ display:'flex', alignItems:'center', gap:'5px', marginLeft:'4px' }}>
          <div style={{ width:'8px', height:'8px', borderRadius:'50%', background: isConnected ? '#3fb950' : '#f85149', boxShadow: isConnected ? '0 0 8px #3fb95080' : 'none', transition:'all 0.3s' }} />
          <span style={{ fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color: isConnected ? '#3fb95080' : '#f85149' }}>
            {isConnected ? 'live' : 'offline'}
          </span>
        </div>
      </header>

      {/* ══ BODY — 3 resizable columns ════════════════════════════════════════ */}
      <div style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>

        {/* ── LEFT: Syscall Trace ────────────────────────────────────────── */}
        <div style={{ width:`${leftWidth}px`, flexShrink:0, display:'flex', flexDirection:'column' }}>

          {/* Panel header */}
          <div style={{ height:'36px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 10px', background:'#161b22', borderBottom:B, borderRight:B }}>
            <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize:'14px', color:'#58a6ff', fontVariationSettings:"'FILL' 1" }}>analytics</span>
              <span style={{ fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#8b949e', fontFamily:'Space Grotesk, sans-serif', whiteSpace:'nowrap' }}>
                {phase === 'replay' ? `Trace (${steps.length})` : 'Syscall Trace'}
              </span>
            </div>
            {phase === 'replay' && (
              <div style={{ display:'flex', alignItems:'center', gap:'2px' }}>
                <button onClick={() => setSelectedStep(s => Math.max(0,s-1))} disabled={selectedStep===0}
                  style={{ width:'22px', height:'22px', display:'flex', alignItems:'center', justifyContent:'center', background:'transparent', border:'none', cursor:'pointer', borderRadius:'4px', opacity: selectedStep===0 ? 0.2 : 1 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:'14px', color:'#8b949e' }}>chevron_left</span>
                </button>
                <span style={{ fontFamily:'monospace', fontSize:'10px', color:'#6e7681', minWidth:'40px', textAlign:'center' }}>
                  {selectedStep+1}/{filteredSteps.length}
                </span>
                <button onClick={() => setSelectedStep(s => Math.min(filteredSteps.length-1, s+1))} disabled={selectedStep>=filteredSteps.length-1}
                  style={{ width:'22px', height:'22px', display:'flex', alignItems:'center', justifyContent:'center', background:'transparent', border:'none', cursor:'pointer', borderRadius:'4px', opacity: selectedStep>=filteredSteps.length-1 ? 0.2 : 1 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:'14px', color:'#8b949e' }}>chevron_right</span>
                </button>
              </div>
            )}
          </div>

          {/* Category filters */}
          {phase === 'replay' && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:'4px', padding:'6px 8px', background:'#0d1117', borderBottom:B, borderRight:B, flexShrink:0 }}>
              {(['all','io','files','memory','process','other'] as const).map(cat => {
                const count = cat === 'all' ? steps.length : (catCounts[cat] ?? 0);
                if (cat !== 'all' && count === 0) return null;
                const active = activeCategory === cat;
                const color  = cat === 'all' ? '#58a6ff' : CAT_COLOR[cat];
                return (
                  <button key={cat} onClick={() => { setActiveCategory(cat); setSelectedStep(0); }}
                    style={{ display:'flex', alignItems:'center', gap:'3px', padding:'3px 8px', borderRadius:'5px', fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em', cursor:'pointer', fontFamily:'Space Grotesk, sans-serif', transition:'all 0.1s', background: active ? `${color}1a` : 'transparent', color: active ? color : '#6e7681', border:`1px solid ${active ? `${color}35` : '#30363d'}` }}>
                    {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase()+cat.slice(1)}
                    <span style={{ fontFamily:'monospace', opacity:0.7 }}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step list */}
          <div style={{ flex:1, overflowY:'auto', background:'#0d1117', borderRight:B }} className="custom-scrollbar">
            {phase === 'idle' && !compileError && (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:'12px', padding:'24px', textAlign:'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize:'32px', color:'#30363d', fontVariationSettings:"'FILL' 1" }}>analytics</span>
                <p style={{ fontSize:'13px', fontWeight:700, color:'#6e7681', fontFamily:'Space Grotesk, sans-serif' }}>Ready to trace</p>
                <p style={{ fontFamily:'monospace', fontSize:'11px', color:'#484f58', lineHeight:1.6, margin:0 }}>Write C → Run → click any syscall</p>
              </div>
            )}
            {phase === 'collecting' && (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:'12px' }}>
                <div style={{ position:'relative', width:'36px', height:'36px' }}>
                  <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'2px solid #3fb950', opacity:0.2, animation:'ping 1s infinite' }} />
                  <div style={{ width:'36px', height:'36px', borderRadius:'50%', border:'2px solid #21262d', borderTopColor:'#3fb950', animation:'spin 0.7s linear infinite' }} />
                </div>
                <p style={{ fontSize:'13px', fontWeight:700, color:'#3fb950', fontFamily:'Space Grotesk, sans-serif', margin:0 }}>Tracing…</p>
              </div>
            )}
            {phase === 'replay' && (
              <>
                {/* Exit banner */}
                <div style={{ display:'flex', alignItems:'center', gap:'8px', margin:'8px 8px 4px', padding:'8px 10px', borderRadius:'8px', background: exitCode===0 ? '#3fb95015' : '#f8514918', border:`1px solid ${exitCode===0 ? '#3fb95030' : '#f8514940'}` }}>
                  <span className="material-symbols-outlined" style={{ fontSize:'15px', color: exitCode===0 ? '#3fb950' : '#f85149', fontVariationSettings:"'FILL' 1" }}>
                    {exitCode === 0 ? 'check_circle' : 'cancel'}
                  </span>
                  <span style={{ fontFamily:'monospace', fontSize:'12px', fontWeight:700, color: exitCode===0 ? '#3fb950' : '#f85149' }}>
                    Exited · code {exitCode}
                  </span>
                  <span style={{ marginLeft:'auto', fontFamily:'monospace', fontSize:'10px', color:'#6e7681' }}>← → navigate</span>
                </div>

                {filteredSteps.length === 0 && (
                  <p style={{ fontFamily:'monospace', fontSize:'11px', color:'#6e7681', textAlign:'center', padding:'24px' }}>No syscalls in this category</p>
                )}

                {filteredSteps.map(step => (
                  <StepItem key={step.index} step={step}
                    isSelected={step.index === filteredSteps[selectedStep]?.index}
                    onClick={() => setSelectedStep(filteredSteps.indexOf(step))}
                    scrollRef={step.index === filteredSteps[selectedStep]?.index ? selectedRef : undefined}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        {/* ↔ Left resize handle */}
        <ResizeHandle dir="v" onMouseDown={e => startDrag('left', e)} />

        {/* ── CENTER: Editor ─────────────────────────────────────────────── */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
          <div style={{ height:'36px', flexShrink:0, display:'flex', alignItems:'center', gap:'8px', padding:'0 12px', background:'#161b22', borderBottom:B }}>
            <span className="material-symbols-outlined" style={{ fontSize:'14px', color:'#58a6ff', fontVariationSettings:"'FILL' 1" }}>code</span>
            <span style={{ fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#8b949e', fontFamily:'Space Grotesk, sans-serif' }}>Editor</span>
            <span style={{ fontFamily:'monospace', fontSize:'11px', color:'#6e7681' }}>main.c</span>
          </div>
          <div style={{ flex:1, overflow:'hidden' }}>
            <Editor
              defaultLanguage="c" theme="vs-dark" value={code}
              onChange={v => setCode(v ?? '')}
              options={{
                minimap:{enabled:false}, fontSize:14,
                fontFamily:'JetBrains Mono, Fira Code, monospace',
                fontLigatures:true, scrollBeyondLastLine:false,
                padding:{top:16,bottom:16}, lineNumbers:'on',
                renderLineHighlight:'gutter',
                bracketPairColorization:{enabled:true},
                smoothScrolling:true, cursorBlinking:'phase',
                cursorSmoothCaretAnimation:'on', tabSize:4,
              }}
            />
          </div>
        </div>

        {/* ↔ Right resize handle */}
        <ResizeHandle dir="v" onMouseDown={e => startDrag('right', e)} />

        {/* ── RIGHT: Kernel Graph ─────────────────────────────────────────── */}
        <div style={{ width:`${rightWidth}px`, flexShrink:0, display:'flex', flexDirection:'column', background:'#010409' }}>
          <div style={{ height:'36px', flexShrink:0, display:'flex', alignItems:'center', gap:'6px', padding:'0 12px', background:'#161b22', borderBottom:B, borderLeft:B }}>
            <span className="material-symbols-outlined" style={{ fontSize:'14px', color:'#58a6ff', fontVariationSettings:"'FILL' 1" }}>account_tree</span>
            <span style={{ fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#8b949e', fontFamily:'Space Grotesk, sans-serif' }}>Kernel Graph</span>
            {phase === 'replay' && (
              <span style={{ fontFamily:'monospace', fontSize:'10px', color:'#6e7681', marginLeft:'auto' }}>
                step {(filteredSteps[selectedStep]?.index ?? 0)+1}
              </span>
            )}
          </div>
          <div style={{ flex:1, overflow:'hidden', borderLeft:B }}>
            <SyscallCanvas events={canvasEvents} />
          </div>
        </div>
      </div>

      {/* ↕ Bottom resize handle */}
      <ResizeHandle dir="h" onMouseDown={e => startDrag('bottom', e)} />

      {/* ══ BOTTOM: Terminal ══════════════════════════════════════════════════ */}
      <div style={{ height:`${bottomHeight}px`, flexShrink:0, display:'flex', flexDirection:'column', background:'#010409' }}>
        <div style={{ height:'36px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 12px', background:'#161b22', borderTop:B }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <span className="material-symbols-outlined" style={{ fontSize:'14px', color:'#58a6ff', fontVariationSettings:"'FILL' 1" }}>terminal</span>
            <span style={{ fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#8b949e', fontFamily:'Space Grotesk, sans-serif' }}>Terminal Output</span>
            {exitCode !== null && (
              <span style={{ padding:'2px 7px', borderRadius:'4px', fontSize:'10px', fontWeight:700, fontFamily:'monospace', background: exitCode===0 ? '#3fb95015' : '#f8514915', color: exitCode===0 ? '#3fb950' : '#f85149', border:`1px solid ${exitCode===0 ? '#3fb95025' : '#f8514925'}` }}>
                exit {exitCode}
              </span>
            )}
            {compileError && <span style={{ fontFamily:'monospace', fontSize:'10px', color:'#f85149', fontWeight:700 }}>compile error</span>}
          </div>
          {terminalText && (
            <button onClick={() => setTerminalText('')}
              style={{ fontFamily:'monospace', fontSize:'11px', color:'#6e7681', background:'transparent', border:'none', cursor:'pointer', transition:'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color='#c9d1d9')}
              onMouseLeave={e => (e.currentTarget.style.color='#6e7681')}>
              clear
            </button>
          )}
        </div>

        <div ref={termRef}
          style={{ flex:1, overflowY:'auto', padding:'10px 14px', fontFamily:'JetBrains Mono, Fira Code, monospace', fontSize:'13px', lineHeight:'1.7' }}
          className="custom-scrollbar">
          <div style={{ display:'flex', gap:'8px', marginBottom:'6px' }}>
            <span style={{ color:'#3fb950', fontWeight:700 }}>$</span>
            <span style={{ color:'#8b949e' }}>./prog</span>
          </div>
          {phase === 'idle' && !terminalText && !compileError && (
            <span style={{ color:'#484f58' }}>program output will appear here…</span>
          )}
          {phase === 'collecting' && !terminalText && (
            <span style={{ color:'#3fb95070' }}>executing…</span>
          )}
          {terminalText && (
            <pre style={{ color:'#e6edf3', whiteSpace:'pre-wrap', wordBreak:'break-word', margin:0, fontSize:'13px', lineHeight:'1.7' }}>
              {terminalText}
            </pre>
          )}
          {compileError && (
            <div style={{ marginTop:'4px' }}>
              <span style={{ color:'#f85149', fontWeight:700, fontSize:'12px' }}>gcc error</span>
              <pre style={{ color:'#ffa198', whiteSpace:'pre-wrap', margin:'4px 0 0', lineHeight:1.6, fontSize:'12px' }}>{compileError}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
