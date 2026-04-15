package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os/exec"
	"runtime"
	"sync"
	"time"

	"syscv-backend/internal/runner"
	"syscv-backend/internal/tracer"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type SocketRequest struct {
	Action string `json:"action"`
	Code   string `json:"code,omitempty"`
}

// session is the GLOBAL shared state for the single active trace.
//
// Race fix summary:
//
//   - The tracer now uses Wait4(specific_pid) not Wait4(-1). This means
//     concurrent TraceLoop goroutines can never steal each other's ptrace events
//     (e.g. the old goroutine accidentally reaping the new child's SIGTRAP or a
//     gcc zombie, causing ECHILD on the new Wait4).
//
//   - A generation counter (gen) ensures that stale goroutines from old sessions
//     (stream goroutine, handleTrace cleanup) can never tear down a newer session.
//
//   - Each handleTrace tracks myGen locally so the connection-close cleanup only
//     stops its own session, never a newer one that started on a different WS.
var globalSess session

type session struct {
	mu          sync.Mutex
	controlChan chan string
	cmd         *exec.Cmd
	active      bool
	gen         uint64
}

func (s *session) stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.teardownLocked()
}

func (s *session) stopIfGen(g uint64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.gen != g {
		return
	}
	s.teardownLocked()
}

func (s *session) teardownLocked() {
	if !s.active {
		return
	}
	s.active = false
	if s.cmd != nil && s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
		s.cmd = nil
	}
	if s.controlChan != nil {
		close(s.controlChan)
		s.controlChan = nil
	}
}

func (s *session) start(cmd *exec.Cmd) (chan string, uint64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.gen++
	s.controlChan = make(chan string, 10)
	s.cmd = cmd
	s.active = true
	return s.controlChan, s.gen
}

func (s *session) send(cmd string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.active && s.controlChan != nil {
		select {
		case s.controlChan <- cmd:
		default:
		}
	}
}

func main() {
	http.HandleFunc("/trace", handleTrace)
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		w.Write([]byte("ok"))
	})
	fmt.Println("Backend started on ws://localhost:8080/trace")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func handleTrace(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("upgrade error:", err)
		return
	}
	defer conn.Close()

	// myGen tracks which session generation THIS connection started.
	// Connection-close cleanup uses stopIfGen(myGen) so it never kills a newer
	// session that was started by a different connection.
	var myGen uint64
	var connMu sync.Mutex

	writeJSON := func(v interface{}) {
		connMu.Lock()
		defer connMu.Unlock()
		if err := conn.WriteJSON(v); err != nil {
			log.Println("write error:", err)
		}
	}

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			log.Println("read error:", err)
			break
		}

		var req SocketRequest
		if err := json.Unmarshal(msg, &req); err != nil {
			log.Println("unmarshal error:", err)
			continue
		}

		log.Println("action:", req.Action)

		switch req.Action {
		case "run":
			globalSess.stop()
			time.Sleep(150 * time.Millisecond)

			exePath, err := runner.Compile(req.Code)
			if err != nil {
				writeJSON(map[string]interface{}{"type": "error", "message": err.Error()})
				continue
			}

			stream := make(chan interface{}, 200)
			syncChan := make(chan uint64)

			go func() {
				runtime.LockOSThread()
				defer runtime.UnlockOSThread()

				cmd, outputReader, err := runner.StartTrace(exePath)
				if err != nil {
					writeJSON(map[string]interface{}{"type": "error", "message": err.Error()})
					close(syncChan)
					return
				}

				go func() {
					io.Copy(io.Discard, outputReader)
					outputReader.Close()
				}()

				controlChan, gen := globalSess.start(cmd)
				syncChan <- gen

				tracer.TraceLoop(cmd, stream, controlChan)
			}()

			if gen, ok := <-syncChan; ok {
				myGen = gen
				go func(s <-chan interface{}, g uint64) {
					for event := range s {
						writeJSON(event)
					}
					globalSess.stopIfGen(g)
				}(stream, gen)
			}

		case "step", "play", "pause":
			globalSess.send(req.Action)
		}
	}

	// Connection closed — only stop our own generation.
	if myGen > 0 {
		globalSess.stopIfGen(myGen)
	}
}
