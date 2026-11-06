import SwiftUI
import SafariServices
import Network
import CryptoKit
import Security
import UIKit

@main
struct SmartDiveAuthApp: App {
    var body: some Scene { WindowGroup { ContentView() } }
}

struct BrowserPage: Identifiable { let id = UUID(); let url: URL }
struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }
    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

struct ContentView: View {
    @StateObject private var model = AuthModel()
    @Environment(\.scenePhase) private var scenePhase
    private func t(_ ja: String, _ en: String) -> String { model.language == "ja" ? ja : en }
    private func step(_ number: Int, _ title: String, done: Bool) -> some View {
        HStack {
            Text("\(number) · \(title)")
            Spacer()
            if done { Label("Success", systemImage: "checkmark.circle.fill").foregroundStyle(.green) }
        }.font(.subheadline.bold())
    }
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Language / 言語", selection: $model.language) {
                        Text("English").tag("en")
                        Text("日本語").tag("ja")
                    }.pickerStyle(.segmented)
                    Text(t("Even G2向けSmart Diveの接続アプリです。コードを貼り付けてからログインします。", "Connect Smart Dive for Even G2. Paste your connection code before signing in."))
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                Section {
                    TextField(t("接続コードを貼り付け", "Paste connection code"), text: $model.pairCode)
                        .textInputAutocapitalization(.never).autocorrectionDisabled().privacySensitive()
                        .disabled(model.busy)
                    PasteButton(payloadType: String.self) { strings in
                        if let value = strings.first { model.pairCode = value }
                    }.disabled(model.busy)
                    if model.pairSent {
                        Text(t("認証情報の連携まで完了しました。貼り付け直す必要はありません。手順4へ進んでください。", "Your connection has been sent. You do not need to paste again. Continue to step 4."))
                            .font(.caption).foregroundStyle(.secondary)
                    } else if model.validPairCode {
                        Text(model.loginReady
                            ? t("コードの貼り付けとログインが完了しました。貼り付け直さず、手順3「認証情報を連携」へ進んでください。", "Code pasted and signed in. Do not paste again. Continue to step 3, Send connection.")
                            : t("接続コードの貼り付けが完了しました。コピー・貼り付けはもう不要です。手順2「Builder IDでログイン」へ進んでください。", "Connection code pasted successfully. No need to copy or paste again. Continue to step 2, Sign in with Builder ID."))
                            .font(.caption).foregroundStyle(.secondary)
                    } else {
                        Text(t("EvenアプリまたはWebブラウザでSmart Diveを開き、表示された接続コードをコピーして、ここに貼り付けてください。", "Open Smart Dive in the Even app or Web browser. Copy the displayed connection code and paste it here."))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                } header: { step(1, t("接続コード", "Connection code"), done: model.validPairCode || model.pairSent) }
                Section {
                    Button(t("Builder IDでログイン", "Sign in with Builder ID")) { model.start() }
                        .disabled(model.busy || !model.validPairCode)
                    Text(model.localizedStatus).font(.caption).foregroundStyle(.secondary)
                } header: { step(2, t("AWSにログイン", "Sign in to AWS"), done: model.loginReady) }
                Section {
                    Button(t("認証情報を連携", "Send connection")) { model.sendPairing() }
                        .disabled(!model.loginReady || !model.validPairCode || model.busy || model.pairSent)
                    Text(model.localizedPairStatus).font(.caption).foregroundStyle(.secondary)
                } header: { step(3, t("認証情報を連携", "Connect"), done: model.pairSent) }
                Section {
                    Text(t("Evenアプリの元の画面へ戻り「接続を確認」を押してください。", "Return to your original Smart Dive screen in the Even app and tap Check connection."))
                    Text(t("Web版を使っていた場合も、コードをコピーした元のタブへ戻ります。", "For the optional Web version, return to the same browser tab where you copied the code."))
                        .font(.caption).foregroundStyle(.secondary)
                    if model.returnedToCockpit { Text(t("アプリ切替を確認しました。接続の完了は本体画面で確認してください。", "App switch detected. Confirm the completed connection in Smart Dive.")) .font(.caption) }
                } header: { step(4, t("本体アプリへ戻る", "Return to Smart Dive"), done: model.returnedToCockpit) }
                Section {
                    DisclosureGroup(t("詳細設定・開発用", "Advanced / development")) {
                        TextField("Relay URL", text: $model.relayURL)
                            .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                        Button(t("予定を再取得", "Reload schedule")) { model.reload() }.disabled(!model.canReload || model.busy)
                        Button(t("ログアウト・データ消去", "Sign out and clear data"), role: .destructive) { model.signOut() }.disabled(model.busy)
                        ForEach(Array(model.logs.enumerated()), id: \.offset) { _, line in
                            Text(line).font(.system(.caption, design: .monospaced))
                        }
                        DisclosureGroup(t("旧ローカルQR方式", "Legacy local QR")) {
                            Button(t("予約の詳細を取得", "Load reserved session details")) { model.loadDetails() }.disabled(!model.canReload || model.busy)
                            Toggle(t("オンライン検証", "Online validation"), isOn: $model.onlineEnabled)
                            if !model.handoffCommand.isEmpty {
                                Text(model.handoffCommand).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                                Button(t("QRコマンドをコピー", "Copy QR command")) { UIPasteboard.general.string = model.handoffCommand }
                                Button(t("引渡し開始", "Start handoff")) { model.startHandoff() }.disabled(model.busy)
                            }
                            Text(model.handoffStatus).font(.caption)
                        }
                    }
                }
            }
            .navigationTitle("Smart Dive Connect")
            .environment(\.locale, Locale(identifier: model.language))
            .onChange(of: scenePhase) { _, phase in model.phaseChanged(phase) }
            .sheet(item: $model.browser, onDismiss: { model.browserClosed() }) { page in
                SafariView(url: page.url).ignoresSafeArea().interactiveDismissDisabled()
            }
        }
    }
}

struct PoCError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

@MainActor
final class AuthModel: ObservableObject {
    @Published var language = UserDefaults.standard.string(forKey: "smart-dive-language") ?? (Locale.preferredLanguages.first?.hasPrefix("ja") == true ? "ja" : "en") { didSet { UserDefaults.standard.set(language, forKey: "smart-dive-language") } }
    @Published var pairSent = false
    @Published var returnedToCockpit = false
    var validPairCode: Bool {
        pairCode.trimmingCharacters(in: .whitespacesAndNewlines)
            .range(of: "^sd1\\.[a-f0-9]{32}\\.[a-f0-9]{64}$", options: .regularExpression) != nil
    }
    var loginReady: Bool { canReload && expires > Date() && !access.isEmpty }
    var localizedStatus: String {
        if language == "ja" { return loginReady ? "ログイン成功" : status }
        if loginReady { return "Signed in successfully." }
        switch status {
        case "未実行": return "Ready to sign in."
        case "ログイン情報を消去中…": return "Clearing sign-in data…"
        case "ログイン情報を消去しました。": return "Sign-in data cleared. Ready to sign in again."
        case "Safari画面でBuilder IDにログインしてください。": return "Sign in with Builder ID in the browser."
        case "トークン交換中": return "Completing sign-in…"
        case "予定取得中": return "Checking your event registration…"
        default: return "Sign-in could not complete. Check your connection and re:Invent-registered Builder ID, then retry."
        }
    }
    var localizedPairStatus: String {
        if language == "ja" { return pairStatus }
        if pairSent { return "Sent. Return to the original Smart Dive screen and check the connection within 2 minutes." }
        switch pairStatus {
        case "Webの接続コードを貼付してください。": return "Paste the code from Smart Dive."
        case "暗号化して送信中…": return "Encrypting and sending…"
        case "先にログインしてください。": return "Sign in first."
        case "接続コードを確認してください。": return "Check the connection code."
        case "自分のAWS中継URLを入力してください。": return "Check the relay URL in Advanced settings."
        default: return "Could not send. Create a new code in Smart Dive and retry."
        }
    }
    @Published var browser: BrowserPage?
    @Published var status = "未実行"
    @Published var logs: [String] = []
    @Published var busy = false
    @Published var canReload = false
    @Published var reservedCount: Int?
    @Published var favoritesCount: Int?
    @Published var personalCount: Int?
    @Published var fetched: String?
    @Published var relayURL = "" // Configure your Relay URL under Advanced / development.
    @Published var onlineEnabled = false
    @Published var handoffCommand = ""
    @Published var handoffStatus = "未準備"
    @Published var pairCode = "" { didSet { if !pairCode.isEmpty && pairCode != oldValue { pairSent = false; returnedToCockpit = false } } }
    @Published var pairStatus = "Webの接続コードを貼付してください。"
    private var reservedIDs: [String] = []
    private var snapshotData: Data?
    private var handoffKey = UUID().uuidString.replacingOccurrences(of: "-", with: "")
    private var snapshotServer: SnapshotServer?
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid
    private var handoffTimer: Task<Void, Never>?
    private let callback = "http://127.0.0.1:8484/callback"
    private let client = "7vmom55m1qstvq8i71ph127bfq"
    private var listener: LoopbackReceiver?
    private var verifier = ""
    private var expectedState = ""
    private var access = ""
    private var expires = Date.distantPast
    private var attempt = UUID()
    private var timeout: Task<Void, Never>?
    private var operation: Task<Void, Never>?
    private let session = URLSession(configuration: .ephemeral, delegate: NoRedirects(), delegateQueue: nil)

    private func log(_ text: String) { logs.append(text) }
    private func random(_ count: Int) throws -> String {
        var bytes = [UInt8](repeating: 0, count: count)
        guard SecRandomCopyBytes(kSecRandomDefault, count, &bytes) == errSecSuccess else {
            throw PoCError(message: "安全な乱数を作成できませんでした。")
        }
        return Data(bytes).base64URL
    }
    // A manual sign-out clears this app's Safari view data as well as in-memory tokens.
    // start() still uses reset() so normal sign-in does not unexpectedly clear browser data.
    func signOut() {
        reset()
        busy = true
        status = "ログイン情報を消去中…"
        let run = attempt
        SFSafariViewController.DataStore.default.clearWebsiteData { [weak self] in
            Task { @MainActor in
                guard let self = self, self.attempt == run else { return }
                self.busy = false
                self.status = "ログイン情報を消去しました。"
            }
        }
    }
    func reset() {
        pairSent = false; returnedToCockpit = false
        pairCode = ""; pairStatus = "Webの接続コードを貼付してください。"
        stopHandoff()
        handoffKey = UUID().uuidString.replacingOccurrences(of: "-", with: "")
        snapshotData = nil; reservedIDs = []; handoffCommand = ""; handoffStatus = "未準備"
        attempt = UUID(); operation?.cancel(); operation = nil
        timeout?.cancel(); timeout = nil; listener?.stop(); listener = nil
        browser = nil; verifier = ""; expectedState = ""; access = ""
        expires = .distantPast; canReload = false; busy = false
        reservedCount = nil; favoritesCount = nil; personalCount = nil; fetched = nil
        logs = []; status = "未実行"
    }
    func sendPairing() {
        guard !busy, canReload, expires > Date() else { pairStatus = "先にログインしてください。"; return }
        let parts = pairCode.trimmingCharacters(in: .whitespacesAndNewlines).components(separatedBy: ".")
        guard parts.count == 3, parts[0] == "sd1",
              parts[1].range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil,
              parts[2].range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { pairStatus = "接続コードを確認してください。"; return }
        let relay = relayURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard relay.range(of: "^https://[a-z0-9]+\\.execute-api\\.ap-northeast-1\\.amazonaws\\.com$", options: .regularExpression) != nil else { pairStatus = "自分のAWS中継URLを入力してください。"; return }
        let slot = parts[1], keyHex = parts[2]
        var keyBytes = [UInt8](); var pos = keyHex.startIndex
        while pos < keyHex.endIndex { let end = keyHex.index(pos, offsetBy: 2); guard let byte = UInt8(keyHex[pos..<end], radix: 16) else { return }; keyBytes.append(byte); pos = end }
        busy = true; let run = attempt; pairStatus = "暗号化して送信中…"
        operation = Task {
            defer { if attempt == run { busy = false } }
            do {
                let plain = try JSONSerialization.data(withJSONObject: ["relay": relay, "accessToken": access, "expiresAt": expires.timeIntervalSince1970 * 1000])
                let box = try AES.GCM.seal(plain, using: SymmetricKey(data: Data(keyBytes)), authenticating: Data(slot.utf8))
                guard let combined = box.combined else { throw PoCError(message: "暗号化できませんでした。") }
                var request = URLRequest(url: URL(string: relay + "/pair")!); request.httpMethod = "POST"; request.timeoutInterval = 30
                request.setValue("Bearer " + access, forHTTPHeaderField: "Authorization")
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try JSONSerialization.data(withJSONObject: ["slot": slot, "sealed": combined.base64EncodedString()])
                let (_, response) = try await session.data(for: request)
                guard attempt == run, !Task.isCancelled else { return }
                guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw PoCError(message: "送信失敗。Webで新しい接続コードを作り再試行してください。") }
                pairSent = true; pairCode = ""; pairStatus = "送信しました。2分以内にWeb／Evenへ戻り「接続を確認」を押してください。"
            } catch { if attempt == run { pairStatus = (error as? PoCError)?.message ?? "送信できませんでした。接続コードを作り直してください。" } }
        }
    }
    func start() {
        let savedCode = pairCode
        reset(); pairCode = savedCode; busy = true; let run = attempt
        do {
            verifier = try random(48); expectedState = try random(32)
            let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URL
            var url = URLComponents(string: "https://oauth.awsevents.com/oauth2/authorize")!
            url.queryItems = ["response_type": "code", "client_id": client,
                "redirect_uri": callback, "scope": "openid email events/access",
                "identity_provider": "AWSBuilderID", "code_challenge": challenge,
                "code_challenge_method": "S256", "state": expectedState]
                .map { URLQueryItem(name: $0.key, value: $0.value) }
            let loginURL = url.url!
            let receiver = try LoopbackReceiver(expectedState: expectedState)
            listener = receiver
            receiver.start(onReady: { [weak self] in
                Task { @MainActor in
                    guard let self = self, self.attempt == run else { return }
                    self.log("1 OK: iPhone 127.0.0.1:8484で待受開始")
                    self.status = "Safari画面でBuilder IDにログインしてください。"
                    self.browser = BrowserPage(url: loginURL)
                    self.log("2 START: Safariログイン画面を表示")
                }
            }, onCode: { [weak self] code in
                Task { @MainActor in
                    guard let self = self, self.attempt == run else { return }
                    self.timeout?.cancel(); self.browser = nil
                    self.log("3 OK: callback受信・state照合成功")
                    self.status = "トークン交換中"
                    self.operation = Task { await self.exchange(code: code, run: run) }
                }
            }, onFailure: { [weak self] message in
                Task { @MainActor in
                    guard let self = self, self.attempt == run else { return }
                    self.fail(message)
                }
            })
            timeout = Task { [weak self] in
                do { try await Task.sleep(nanoseconds: 600_000_000_000) } catch { return }
                guard let self = self, self.attempt == run else { return }
                self.fail("ログインが10分以内に完了しませんでした。")
            }
        } catch { fail("待受準備に失敗: \(error.localizedDescription)") }
    }
    func browserClosed() {
        // Programmatic dismissal after a valid callback must not cancel the exchange.
        if busy && !expectedState.isEmpty && operation == nil {
            fail("ログイン画面が閉じられました。もう一度ログインしてください。")
        }
    }
    private func fail(_ text: String) {
        timeout?.cancel(); listener?.stop(); listener = nil
        expectedState = ""; verifier = ""; browser = nil; busy = false
        status = text; log("STOP: " + text)
    }
    private func exchange(code: String, run: UUID) async {
        defer { if attempt == run { verifier = ""; expectedState = ""; busy = false } }
        var request = URLRequest(url: URL(string: "https://oauth.awsevents.com/oauth2/token")!)
        request.httpMethod = "POST"; request.timeoutInterval = 30
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        let fields = ["grant_type": "authorization_code", "client_id": client,
                      "redirect_uri": callback, "code": code, "code_verifier": verifier]
        request.httpBody = Data(fields.map { form($0.key) + "=" + form($0.value) }.joined(separator: "&").utf8)
        do {
            let (data, response) = try await session.data(for: request)
            guard attempt == run, !Task.isCancelled else { return }
            guard let http = response as? HTTPURLResponse else { throw PoCError(message: "トークン応答形式が不正です。") }
            guard http.statusCode == 200 else { throw PoCError(message: "トークン交換失敗 HTTP \(http.statusCode)") }
            let token = try JSONDecoder().decode(TokenReply.self, from: data)
            guard !token.access_token.isEmpty, token.expires_in > 0 else { throw PoCError(message: "有効なトークンがありません。") }
            access = token.access_token; expires = Date().addingTimeInterval(token.expires_in)
            canReload = true; log("4 OK: トークン交換成功（メモリ内保持）")
            try await fetchSchedule(run: run)
        } catch {
            guard attempt == run else { return }
            fail((error as? PoCError)?.message ?? "通信または応答解析に失敗しました。接続と認証を確認してください。")
        }
    }
    func reload() {
        guard !busy else { return }
        guard !access.isEmpty, Date() < expires else {
            canReload = false; access = ""; fail("認証期限切れです。再ログインしてください。"); return
        }
        busy = true; let run = attempt
        operation = Task {
            defer { if attempt == run { busy = false } }
            do { try await fetchSchedule(run: run) }
            catch { if attempt == run { fail((error as? PoCError)?.message ?? "予定取得に失敗しました。") } }
        }
    }
    private func stopHandoff() {
        handoffTimer?.cancel(); handoffTimer = nil
        snapshotServer?.stop(); snapshotServer = nil
        if backgroundTask != .invalid { UIApplication.shared.endBackgroundTask(backgroundTask); backgroundTask = .invalid }
    }
    func phaseChanged(_ phase: ScenePhase) {
        if phase == .background, pairSent { returnedToCockpit = true }
        if phase == .background, snapshotServer != nil, backgroundTask == .invalid {
            backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Complete snapshot handoff") { [weak self] in
                Task { @MainActor in
                    self?.stopHandoff()
                    self?.handoffStatus = "OSの実行猶予が終了。取得済みG2表示は別途確認してください。"
                }
            }
        }
        if phase == .active, backgroundTask != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTask); backgroundTask = .invalid
        }
    }
    func startHandoff() {
        stopHandoff()
        guard var data = snapshotData else { return }
        if onlineEnabled {
            guard expires > Date(), !access.isEmpty else { handoffStatus = "先に再ログインしてください。"; return }
            guard let url = URLComponents(string: relayURL.trimmingCharacters(in: .whitespacesAndNewlines)),
                  url.scheme == "https", url.port == nil, url.user == nil, url.password == nil,
                  url.query == nil, url.fragment == nil, (url.path.isEmpty || url.path == "/"),
                  let host = url.host,
                  host.range(of: "^[a-z0-9]+\\.execute-api\\.ap-northeast-1\\.amazonaws\\.com$", options: .regularExpression) != nil else {
                handoffStatus = "東京リージョンで作成した中継URLを入力してください（パス・クエリなし）。"; return
            }
            do {
                var payload = try JSONSerialization.jsonObject(with: data) as! [String: Any]
                payload["online"] = ["relay": "https://" + host, "accessToken": access, "expiresAt": expires.timeIntervalSince1970 * 1000]
                data = try JSONSerialization.data(withJSONObject: payload)
            } catch { handoffStatus = "引渡しデータを準備できませんでした。"; return }
        }
        do {
            let server = try SnapshotServer(key: handoffKey, snapshot: data)
            snapshotServer = server
            server.start(onReady: { [weak self] in Task { @MainActor in
                self?.handoffStatus = "待受開始。すぐEvenアプリへ切替えQRを読んでください。最大90秒の実験です。"
            } }, onCode: { _ in }, onFailure: { [weak self] message in Task { @MainActor in
                self?.stopHandoff(); self?.handoffStatus = message
            } })
            handoffTimer = Task { [weak self] in
                do { try await Task.sleep(nanoseconds: 90_000_000_000) } catch { return }
                guard !Task.isCancelled else { return }
                self?.stopHandoff(); self?.handoffStatus = "90秒の引渡し実験を終了しました。再試行は引渡し開始を押してください。"
            }
        } catch { handoffStatus = "引渡し待受に失敗しました。" }
    }
    func loadDetails() {
        guard !busy, canReload, expires > Date() else { handoffStatus = "先にログインしてください。"; return }
        stopHandoff(); snapshotData = nil; handoffCommand = ""
        busy = true; let run = attempt; let ids = reservedIDs
        operation = Task {
            defer { if attempt == run { busy = false } }
            do {
                var sessions: [HandoffSession] = []
                for (index, id) in ids.enumerated() {
                    guard attempt == run, !Task.isCancelled else { return }
                    handoffStatus = "予約詳細を取得中 \(index + 1)/\(ids.count)"
                    var url = URL(string: "https://api.awsevents.com/v1/events/reinvent2026/sessions")!
                    url.appendPathComponent(id)
                    var request = URLRequest(url: url); request.timeoutInterval = 30
                    request.setValue("Bearer " + access, forHTTPHeaderField: "Authorization")
                    request.setValue("application/json", forHTTPHeaderField: "Accept")
                    let (data, response) = try await session.data(for: request)
                    guard attempt == run, !Task.isCancelled else { return }
                    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                        if (response as? HTTPURLResponse)?.statusCode == 401 { access = ""; canReload = false }
                        throw PoCError(message: "予約詳細の取得失敗。再ログインまたは時間を置いて再試行してください。")
                    }
                    let detail = try JSONDecoder().decode(DetailReply.self, from: data).session
                    sessions.append(HandoffSession(id: id, code: detail.abbreviation ?? "Session", title: detail.title ?? "Title unavailable", date: detail.sessionTime?.date ?? "TBC", time: detail.sessionTime?.time ?? "TBC", venue: detail.venue ?? "TBC"))
                    if index + 1 < ids.count { try await Task.sleep(nanoseconds: 650_000_000) }
                }
                sessions.sort { ($0.date + $0.time + $0.code) < ($1.date + $1.time + $1.code) }
                guard attempt == run, !Task.isCancelled else { return }
                let stamp = ISO8601DateFormatter().string(from: Date())
                snapshotData = try JSONEncoder().encode(HandoffSnapshot(fetched: stamp, sessions: sessions))
                let link = "http://127.0.0.1:8898/" + handoffKey + "/"
                handoffCommand = "npx --yes --package @evenrealities/evenhub-cli evenhub qr --url \"" + link + "\""
                handoffStatus = "詳細取得済み。QRコマンドをMacで実行し、次に引渡し開始。"
                log("6 OK: G2用スナップショット準備／\(sessions.count)件（トークンなし）")
            } catch {
                if attempt == run { handoffStatus = (error as? PoCError)?.message ?? "詳細取得に失敗しました。" }
            }
        }
    }
    private func fetchSchedule(run: UUID) async throws {
        status = "予定取得中"
        var request = URLRequest(url: URL(string: "https://api.awsevents.com/v1/events/reinvent2026/schedule")!)
        request.timeoutInterval = 30
        request.setValue("Bearer " + access, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await session.data(for: request)
        guard attempt == run, !Task.isCancelled else { return }
        guard let http = response as? HTTPURLResponse else { throw PoCError(message: "予定の応答形式が不正です。") }
        if http.statusCode == 401 { access = ""; canReload = false }
        guard http.statusCode == 200 else { throw PoCError(message: "予定取得失敗 HTTP \(http.statusCode)（403ならre:Invent登録済みBuilder IDを確認）") }
        let reply = try JSONDecoder().decode(ScheduleReply.self, from: data)
        stopHandoff(); snapshotData = nil; handoffCommand = ""; handoffStatus = "詳細を再取得してください"
        reservedIDs = reply.schedule.reserved
        reservedCount = reply.schedule.reserved.count
        favoritesCount = reply.schedule.favorites.count
        personalCount = reply.schedule.personalTime.count
        fetched = Date().formatted(date: .numeric, time: .standard)
        status = "成功：iPhoneだけで個人の予定を取得しました。"
        log("5 OK: GetSchedule成功／予約\(reply.schedule.reserved.count)件")
    }
}

private struct TokenReply: Decodable { let access_token: String; let expires_in: Double }
private struct ScheduleReply: Decodable {
    let schedule: Schedule
    struct Schedule: Decodable {
        let reserved: [String]
        let favorites: [String]
        let personalTime: [IgnoredJSON]
    }
}
// We count personal-time items without retaining or rendering their contents.
private struct IgnoredJSON: Decodable { init(from decoder: Decoder) throws {} }
private func form(_ value: String) -> String {
    value.addingPercentEncoding(withAllowedCharacters: CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"))!
}
private extension Data {
    var base64URL: String { base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
}

private struct DetailReply: Decodable {
    let session: Detail
    struct Detail: Decodable {
        let abbreviation: String?; let title: String?; let venue: String?; let sessionTime: Time?
    }
    struct Time: Decodable { let date: String?; let time: String? }
}
private struct HandoffSession: Codable { let id: String; let code: String; let title: String; let date: String; let time: String; let venue: String }
private struct HandoffSnapshot: Codable { let fetched: String; let sessions: [HandoffSession] }
