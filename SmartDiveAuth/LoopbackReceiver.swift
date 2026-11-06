import Foundation
import Network

// All mutable receiver state is confined to queue. Only bind the IPv4 loopback.
final class LoopbackReceiver {
    private let listener: NWListener
    private let queue = DispatchQueue(label: "smartdive.oauth.loopback")
    private let expectedState: String
    private var used = false
    private var connections: [UUID: NWConnection] = [:]
    private var deadlines: [UUID: DispatchWorkItem] = [:]
    private var ready: (() -> Void)?
    private var code: ((String) -> Void)?
    private var failure: ((String) -> Void)?

    init(expectedState: String) throws {
        self.expectedState = expectedState
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: 8484)
        self.listener = try NWListener(using: parameters)
    }
    func start(onReady: @escaping () -> Void, onCode: @escaping (String) -> Void,
               onFailure: @escaping (String) -> Void) {
        ready = onReady; code = onCode; failure = onFailure
        listener.stateUpdateHandler = { [weak self] state in
            guard let self = self else { return }
            switch state {
            case .ready: self.ready?(); self.ready = nil
            case .failed: self.failure?("localhost待受に失敗しました。ポート使用中などを確認してください。")
            default: break
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            guard let self = self else { connection.cancel(); return }
            guard !self.used, self.connections.count < 8 else { connection.cancel(); return }
            let id = UUID(); self.connections[id] = connection
            connection.start(queue: self.queue)
            let deadline = DispatchWorkItem { [weak self] in self?.close(id) }
            self.deadlines[id] = deadline
            self.queue.asyncAfter(deadline: .now() + 10, execute: deadline)
            self.receive(id, data: Data())
        }
        listener.start(queue: queue)
    }
    func stop() { queue.async { self.stopNow() } }
    private func close(_ id: UUID) {
        deadlines.removeValue(forKey: id)?.cancel()
        connections.removeValue(forKey: id)?.cancel()
    }
    private func stopNow() {
        listener.stateUpdateHandler = nil; listener.newConnectionHandler = nil; listener.cancel()
        for id in Array(connections.keys) { close(id) }
        ready = nil; code = nil; failure = nil
    }
    private func receive(_ id: UUID, data: Data) {
        guard let connection = connections[id] else { return }
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] chunk, _, complete, error in
            guard let self = self else { return }
            var bytes = data; if let chunk = chunk { bytes.append(chunk) }
            guard bytes.count <= 16384 else { self.respond(id, status: "431 Request Header Fields Too Large", text: "Request rejected."); return }
            if let range = bytes.range(of: Data("\r\n\r\n".utf8)), let head = String(data: bytes[..<range.lowerBound], encoding: .utf8) {
                self.handle(id, header: head); return
            }
            if complete || error != nil { self.close(id); return }
            self.receive(id, data: bytes)
        }
    }
    private func handle(_ id: UUID, header: String) {
        let lines = header.components(separatedBy: "\r\n")
        let first = (lines.first ?? "").split(separator: " ")
        guard first.count == 3, first[0] == "GET", first[2] == "HTTP/1.1" else {
            respond(id, status: "400 Bad Request", text: "Invalid request."); return
        }
        let hosts = lines.dropFirst().filter { $0.lowercased().hasPrefix("host:") }
        guard hosts.count == 1, hosts[0].dropFirst(5).trimmingCharacters(in: .whitespaces).lowercased() == "127.0.0.1:8484" else {
            respond(id, status: "400 Bad Request", text: "Invalid host."); return
        }
        let target = String(first[1])
        guard target.hasPrefix("/callback?"), let url = URLComponents(string: "http://127.0.0.1:8484" + target), url.path == "/callback" else {
            respond(id, status: "404 Not Found", text: "Not found."); return
        }
        let items = url.queryItems ?? []
        let states = items.filter { $0.name == "state" }
        guard !used, states.count == 1, states[0].value == expectedState else {
            respond(id, status: "400 Bad Request", text: "Invalid or expired sign-in state."); return
        }
        if items.contains(where: { $0.name == "error" }) {
            used = true
            respond(id, status: "400 Bad Request", text: "Sign-in was declined.", finish: { [weak self] in
                self?.failure?("認可が拒否または中止されました。")
            }); return
        }
        let codes = items.filter { $0.name == "code" }
        guard codes.count == 1, let received = codes[0].value, !received.isEmpty else {
            respond(id, status: "400 Bad Request", text: "Missing authorization code."); return
        }
        used = true
        respond(id, status: "200 OK", text: "Smart Dive received the sign-in response. You can return to the app.", finish: { [weak self] in
            guard let self = self else { return }
            self.code?(received)
        })
    }
    private func respond(_ id: UUID, status: String, text: String, finish: (() -> Void)? = nil) {
        guard let connection = connections[id] else { return }
        let body = Data(text.utf8)
        let header = "HTTP/1.1 \(status)\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: \(body.count)\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n"
        connection.send(content: Data(header.utf8) + body, completion: .contentProcessed { [weak self] _ in
            self?.close(id)
            finish?()
            if finish != nil { self?.stopNow() }
        })
    }
}

// Read-only local snapshot handoff. Never serves access tokens.
import Foundation
import Network

// All mutable receiver state is confined to queue. Only bind the IPv4 loopback.
final class SnapshotServer {
    private let listener: NWListener
    private let queue = DispatchQueue(label: "smartdive.oauth.loopback")
    private let key: String
    private let snapshot: Data
    private var connections: [UUID: NWConnection] = [:]
    private var deadlines: [UUID: DispatchWorkItem] = [:]
    private var ready: (() -> Void)?
    private var code: ((String) -> Void)?
    private var failure: ((String) -> Void)?

    init(key: String, snapshot: Data) throws {
        self.key = key; self.snapshot = snapshot
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: 8898)
        self.listener = try NWListener(using: parameters)
    }
    func start(onReady: @escaping () -> Void, onCode: @escaping (String) -> Void,
               onFailure: @escaping (String) -> Void) {
        ready = onReady; code = onCode; failure = onFailure
        listener.stateUpdateHandler = { [weak self] state in
            guard let self = self else { return }
            switch state {
            case .ready: self.ready?(); self.ready = nil
            case .failed: self.failure?("localhost待受に失敗しました。ポート使用中などを確認してください。")
            default: break
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            guard let self = self else { connection.cancel(); return }
            guard self.connections.count < 8 else { connection.cancel(); return }
            let id = UUID(); self.connections[id] = connection
            connection.start(queue: self.queue)
            let deadline = DispatchWorkItem { [weak self] in self?.close(id) }
            self.deadlines[id] = deadline
            self.queue.asyncAfter(deadline: .now() + 10, execute: deadline)
            self.receive(id, data: Data())
        }
        listener.start(queue: queue)
    }
    func stop() { queue.async { self.stopNow() } }
    private func close(_ id: UUID) {
        deadlines.removeValue(forKey: id)?.cancel()
        connections.removeValue(forKey: id)?.cancel()
    }
    private func stopNow() {
        listener.stateUpdateHandler = nil; listener.newConnectionHandler = nil; listener.cancel()
        for id in Array(connections.keys) { close(id) }
        ready = nil; code = nil; failure = nil
    }
    private func receive(_ id: UUID, data: Data) {
        guard let connection = connections[id] else { return }
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] chunk, _, complete, error in
            guard let self = self else { return }
            var bytes = data; if let chunk = chunk { bytes.append(chunk) }
            guard bytes.count <= 16384 else { self.respond(id, status: "431 Request Header Fields Too Large", text: "Request rejected."); return }
            if let range = bytes.range(of: Data("\r\n\r\n".utf8)), let head = String(data: bytes[..<range.lowerBound], encoding: .utf8) {
                self.handle(id, header: head); return
            }
            if complete || error != nil { self.close(id); return }
            self.receive(id, data: bytes)
        }
    }
    private func handle(_ id: UUID, header: String) {
        let lines = header.components(separatedBy: "\r\n")
        let first = (lines.first ?? "").split(separator: " ")
        guard first.count == 3, first[0] == "GET", first[2] == "HTTP/1.1" else {
            respond(id, status: "400 Bad Request", text: "Invalid request."); return
        }
        let hosts = lines.dropFirst().filter { $0.lowercased().hasPrefix("host:") }
        guard hosts.count == 1, hosts[0].dropFirst(5).trimmingCharacters(in: .whitespaces).lowercased() == "127.0.0.1:8898" else {
            respond(id, status: "400 Bad Request", text: "Invalid host."); return
        }
        let target = String(first[1])
        let prefix = "/" + key + "/"
        guard target.hasPrefix(prefix) else { respond(id, status: "404 Not Found", text: "Not found."); return }
        let path = String(target.dropFirst(prefix.count))
        if path == "snapshot" { send(id, body: snapshot, mime: "application/json"); return }
        if path == "probe" { send(id, body: Data("{\"alive\":true}".utf8), mime: "application/json"); return }
        let file = path.isEmpty ? "cockpit.html" : path
        guard ["index.html", "start.html", "cockpit.html", "ui-language.js", "bridge.js", "display.js", "pairing.js", "sdk.js", "cockpit-guide.png", "g2-launch-qr.png"].contains(file),
              let url = Bundle.main.url(forResource: file, withExtension: nil, subdirectory: "Web"),
              let data = try? Data(contentsOf: url) else {
            respond(id, status: "404 Not Found", text: "Not found."); return
        }
        send(id, body: data, mime: file.hasSuffix(".png") ? "image/png" : file.hasSuffix(".js") ? "text/javascript" : "text/html")
    }
    private func send(_ id: UUID, body: Data, mime: String) {
        guard let connection = connections[id] else { return }
        let header = "HTTP/1.1 200 OK\r\nContent-Type: \(mime); charset=utf-8\r\nContent-Length: \(body.count)\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n"
        connection.send(content: Data(header.utf8) + body, completion: .contentProcessed { [weak self] _ in self?.close(id) })
    }
    private func respond(_ id: UUID, status: String, text: String, finish: (() -> Void)? = nil) {
        guard let connection = connections[id] else { return }
        let body = Data(text.utf8)
        let header = "HTTP/1.1 \(status)\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: \(body.count)\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n"
        connection.send(content: Data(header.utf8) + body, completion: .contentProcessed { [weak self] _ in
            self?.close(id)
            finish?()
            if finish != nil { self?.stopNow() }
        })
    }
}
