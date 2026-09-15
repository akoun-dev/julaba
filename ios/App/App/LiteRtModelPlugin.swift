import Foundation
import Capacitor
import CryptoKit

/** Downloads the versioned LiteRT-LM artifact into private app storage. */
@objc(LiteRtModelPlugin)
public class LiteRtModelPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiteRtModelPlugin"
    public let jsName = "LiteRtModel"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLocalInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "download", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
        ,CAPPluginMethod(name: "generate", returnType: CAPPluginReturnPromise)
    ]

    private var task: URLSessionDataTask?
    private var output: FileHandle?
    private var destination: URL?
    private var expectedSha = ""
    private var expectedBytes = 0
    private var downloadedBytes = 0
    private var currentCall: CAPPluginCall?
    private let queue = DispatchQueue(label: "ci.julaba.litert-model")

    private func modelDirectory() throws -> URL {
        let base = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let directory = base.appendingPathComponent("models/gemma", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    private func modelURL(version: String) throws -> URL {
        try modelDirectory().appendingPathComponent("\(version).litertlm")
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        do {
            let file = try modelURL(version: "Gemma3-1B-IT_multi-prefill-seq_q4_ekv4096")
            call.resolve(["available": true, "modelReady": FileManager.default.fileExists(atPath: file.path)])
        } catch {
            call.resolve(["available": false, "modelReady": false, "reason": "NATIVE_UNSUPPORTED"])
        }
    }

    @objc func getLocalInfo(_ call: CAPPluginCall) {
        do {
            let version = call.getString("version") ?? "Gemma3-1B-IT_multi-prefill-seq_q4_ekv4096"
            let file = try modelURL(version: version)
            let bytes = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber)?.intValue ?? 0
            call.resolve(["bytes": bytes, "expectedBytes": call.getInt("expectedBytes") ?? 0, "version": version])
        } catch {
            call.reject("[PERMISSION_DENIED] Storage unavailable")
        }
    }

    @objc func download(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString),
              let sha = call.getString("sha256"), !sha.isEmpty else {
            call.reject("[CONFIGURATION_MISSING] Model URL and SHA-256 are required")
            return
        }
        let version = call.getString("version") ?? "Gemma3-1B-IT_multi-prefill-seq_q4_ekv4096"
        expectedSha = sha.lowercased()
        expectedBytes = call.getInt("expectedBytes") ?? 0
        downloadedBytes = 0
        currentCall = call

        do {
            let directory = try modelDirectory()
            let temp = directory.appendingPathComponent("\(version).download")
            destination = directory.appendingPathComponent("\(version).litertlm")
            FileManager.default.createFile(atPath: temp.path, contents: nil)
            output = try FileHandle(forWritingTo: temp)
            let session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
            task = session.dataTask(with: url)
            task?.resume()
            notifyState("downloading", nil, nil)
        } catch {
            call.reject("[PERMISSION_DENIED] Unable to prepare model storage")
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        task?.cancel()
        task = nil
        output?.closeFile()
        output = nil
        notifyState("cancelled", "[DOWNLOAD_CANCELLED]", "Téléchargement annulé.")
        currentCall?.reject("[DOWNLOAD_CANCELLED] Download cancelled")
        currentCall = nil
        call.resolve()
    }

    @objc func remove(_ call: CAPPluginCall) {
        do {
            let directory = try modelDirectory()
            try FileManager.default.removeItem(at: directory)
            call.resolve()
        } catch {
            call.resolve()
        }
    }

    @objc func generate(_ call: CAPPluginCall) {
        // Keep inference offline-only. The LiteRT-LM framework must be linked
        // by the native target before this bridge can execute a generation.
        call.reject("[MODEL_LOAD_FAILED] LiteRT-LM runtime unavailable")
    }

    private func notifyProgress(_ total: Int64?) {
        let totalBytes = total ?? Int64(expectedBytes)
        let percent = totalBytes > 0 ? min(100, Int(Double(downloadedBytes) * 100 / Double(totalBytes))) : 0
        notifyListeners("downloadProgress", data: ["downloadedBytes": downloadedBytes, "totalBytes": totalBytes, "percent": percent])
    }

    private func notifyState(_ state: String, _ errorCode: String?, _ message: String?) {
        var data: [String: Any] = ["state": state]
        if let errorCode { data["errorCode"] = errorCode }
        if let message { data["message"] = message }
        notifyListeners("downloadState", data: data)
    }

    private func finalize() {
        guard let destination else { return }
        do {
            output?.closeFile()
            output = nil
            notifyState("verifying", nil, nil)
            let temp = destination.deletingPathExtension().appendingPathExtension("download")
            guard expectedBytes == 0 || FileManager.default.attributes(atPath: temp.path)[.size] as? Int == expectedBytes else { throw NSError(domain: "Gemma", code: 1, userInfo: [NSLocalizedDescriptionKey: "[CORRUPTED_FILE]"]) }
            let data = try Data(contentsOf: temp)
            let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
            guard digest == expectedSha else { throw NSError(domain: "Gemma", code: 2, userInfo: [NSLocalizedDescriptionKey: "[CHECKSUM_MISMATCH]"]) }
            if FileManager.default.fileExists(atPath: destination.path) { try FileManager.default.removeItem(at: destination) }
            try FileManager.default.moveItem(at: temp, to: destination)
            notifyState("ready", nil, nil)
            currentCall?.resolve()
        } catch {
            notifyState("error", error.localizedDescription, error.localizedDescription)
            currentCall?.reject(error.localizedDescription)
        }
        currentCall = nil
    }
}

extension LiteRtModelPlugin: URLSessionDataDelegate {
    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            currentCall?.reject("[SOURCE_UNAVAILABLE] Model source unavailable")
            completionHandler(.cancel)
            return
        }
        notifyProgress(response.expectedContentLength > 0 ? response.expectedContentLength : nil)
        completionHandler(.allow)
    }

    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        output?.write(data)
        downloadedBytes += data.count
        notifyProgress(dataTask.response?.expectedContentLength)
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error {
            currentCall?.reject("[SOURCE_UNAVAILABLE] \(error.localizedDescription)")
            notifyState("error", error.localizedDescription, error.localizedDescription)
            return
        }
        finalize()
    }
}
