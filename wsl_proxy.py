import socket
import threading

def proxy_connection(client_socket):
    target_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        target_socket.connect(('127.0.0.1', 11434))
    except Exception as e:
        print(f"Failed to connect to Ollama: {e}")
        client_socket.close()
        return

    def forward(source, destination):
        try:
            while True:
                data = source.recv(4096)
                if not data:
                    break
                destination.sendall(data)
        except:
            pass
        finally:
            source.close()
            destination.close()

    threading.Thread(target=forward, args=(client_socket, target_socket)).start()
    threading.Thread(target=forward, args=(target_socket, client_socket)).start()

def main():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.bind(('0.0.0.0', 11434))
    server.listen(5)
    print("WSL Proxy listening on 0.0.0.0:11434 -> 127.0.0.1:11434")
    while True:
        client_sock, addr = server.accept()
        proxy_connection(client_sock)

if __name__ == "__main__":
    main()
