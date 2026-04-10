//go:build linux

package tracer

import (
	"bytes"
	"syscall"
)

// ReadString reads a null-terminated string from the tracee's memory up to 'limit'
func ReadString(pid int, addr uintptr, limit int) string {
	if addr == 0 {
		return "NULL"
	}

	var data []byte
	buf := make([]byte, 8)
	
	for i := 0; i < limit; i += 8 {
		bytesRead, err := syscall.PtracePeekData(pid, addr+uintptr(i), buf)
		if err != nil || bytesRead == 0 {
			break
		}
		
		idx := bytes.IndexByte(buf[:bytesRead], 0)
		if idx >= 0 {
			data = append(data, buf[:idx]...)
			break
		}
		data = append(data, buf[:bytesRead]...)
	}

	return string(data)
}
