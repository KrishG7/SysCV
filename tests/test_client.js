const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080/trace');

ws.on('open', function open() {
  console.log("Connected to backend! Sending C program...");
  
  // A simple C program that prints something. 
  // We expect to see 'write' syscalls.
  const code = `
#include <stdio.h>
int main() {
    printf("Hello from SysCV\\n");
    return 0;
}
`;

  ws.send(JSON.stringify({ action: "run", code }));
});

ws.on('message', function incoming(data) {
  const event = JSON.parse(data);
  if (event.type === 'syscall') {
    if (!event.is_exit) {
      let argString = event.args ? event.args.map(a => `${a.name}=${a.str_value ? ('"'+a.str_value+'"') : a.raw_value}`).join(', ') : '';
      console.log(`[Syscall] ${event.name}(${argString})`);
    } else {
      console.log(`[Syscall] -> returns ${event.ret}`);
    }
  } else if (event.type === 'exit') {
    console.log(`[Exit] Process exited with code ${event.exit_code}`);
    ws.close();
  } else if (event.type === 'error') {
    console.log(`[Error] ${event.message}`);
    ws.close();
  } else {
    console.log(data.toString());
  }
});

ws.on('error', function error(err) {
  console.error("WebSocket Error:", err.message);
});

ws.on('close', function close() {
  console.log("Connection closed.");
});
