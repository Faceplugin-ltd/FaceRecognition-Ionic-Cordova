import Foundation
import Cordova
import AVFoundation
import UIKit
import WebKit
import CoreImage
import CoreVideo

@objc(FaceRecognitionSdkPlugin)
public class FaceRecognitionSdkPlugin: CDVPlugin, AVCaptureVideoDataOutputSampleBufferDelegate {
  private var videoWorkerCallbackId: String?

  private var captureSession: AVCaptureSession?
  private var previewContainer: UIView?
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var videoOutput: AVCaptureVideoDataOutput?
  private var boundsObserver: NSKeyValueObservation?
  private let videoQueue = DispatchQueue(label: "com.facerecognitionsdk.camera")
  private let ciContext = CIContext(options: nil)
  private var lastFrameTime: CFTimeInterval = 0
  private var feeding = false
  private var usingFrontCamera = true
  private var originalWebViewOpaque: Bool?

  private var wkWebView: WKWebView? {
    self.webViewEngine?.engineWebView as? WKWebView
  }

  private var previewAnchorView: UIView? {
    wkWebView ?? self.webView
  }

  public override func pluginInitialize() {
    FaceRecognitionSdkBridge.shared().eventHandler = { [weak self] json in
      guard let self = self, let callbackId = self.videoWorkerCallbackId else { return }
      let result = CDVPluginResult(
        status: CDVCommandStatus_OK,
        messageAs: ["json": json]
      )
      result.setKeepCallbackAs(true)
      self.commandDelegate.send(result, callbackId: callbackId)
    }
  }

  private func missingSdk(_ command: CDVInvokedUrlCommand) -> Bool {
    if FaceRecognitionSdkBridge.isAvailable() {
      return false
    }
    fail(
      command,
      "facerecognitionsdk.framework not linked. Drop frameworks into ios/Frameworks.",
      "E_SDK"
    )
    return true
  }

  private func opts(from command: CDVInvokedUrlCommand) -> [String: Any] {
    command.arguments.first as? [String: Any] ?? [:]
  }

  private func succeed(_ command: CDVInvokedUrlCommand, _ message: [AnyHashable: Any]) {
    let result = CDVPluginResult(status: CDVCommandStatus_OK, messageAs: message)
    commandDelegate.send(result, callbackId: command.callbackId)
  }

  private func succeedEmpty(_ command: CDVInvokedUrlCommand) {
    let result = CDVPluginResult(status: CDVCommandStatus_OK)
    commandDelegate.send(result, callbackId: command.callbackId)
  }

  private func fail(_ command: CDVInvokedUrlCommand, _ message: String, _ code: String? = nil) {
    let msg = code != nil ? "\(code!): \(message)" : message
    let result = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: msg)
    commandDelegate.send(result, callbackId: command.callbackId)
  }

  @objc(addVideoWorkerListener:)
  func addVideoWorkerListener(_ command: CDVInvokedUrlCommand) {
    videoWorkerCallbackId = command.callbackId
    let result = CDVPluginResult(status: CDVCommandStatus_NO_RESULT)
    result.setKeepCallbackAs(true)
    commandDelegate.send(result, callbackId: command.callbackId)
  }

  @objc(removeVideoWorkerListener:)
  func removeVideoWorkerListener(_ command: CDVInvokedUrlCommand) {
    videoWorkerCallbackId = nil
    succeedEmpty(command)
  }

  @objc(getMachineCode:)
  func getMachineCode(_ command: CDVInvokedUrlCommand) {
    if missingSdk(command) { return }
    FaceRecognitionSdkBridge.shared().getMachineCode({ value in
      self.succeed(command, ["value": value as? String ?? ""])
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(setActivation:)
  func setActivation(_ command: CDVInvokedUrlCommand) {
    let license = opts(from: command)["license"] as? String
    guard let license = license, !license.isEmpty else {
      fail(command, "license is required", "E_ACTIVATION")
      return
    }
    if missingSdk(command) { return }
    FaceRecognitionSdkBridge.shared().setActivation(license, resolver: { value in
      self.succeed(command, ["value": value as? Int ?? 0])
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(init:)
  func `init`(_ command: CDVInvokedUrlCommand) {
    if missingSdk(command) { return }
    FaceRecognitionSdkBridge.shared().initSDK({ value in
      self.succeed(command, ["value": value as? Int ?? 0])
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(deinit:)
  func deinitSdk(_ command: CDVInvokedUrlCommand) {
    FaceRecognitionSdkBridge.shared().deinitSDK({ _ in
      self.succeedEmpty(command)
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(lastLicenseError:)
  func lastLicenseError(_ command: CDVInvokedUrlCommand) {
    FaceRecognitionSdkBridge.shared().lastLicenseError({ value in
      self.succeed(command, ["value": value as? String ?? ""])
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(setLandmarkMode:)
  func setLandmarkMode(_ command: CDVInvokedUrlCommand) {
    let mode = (opts(from: command)["mode"] as? NSNumber)?.intValue ?? 14
    FaceRecognitionSdkBridge.shared().setLandmarkMode(NSNumber(value: mode), resolver: { value in
      self.succeed(command, ["value": value as? Int ?? mode])
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(getLandmarkMode:)
  func getLandmarkMode(_ command: CDVInvokedUrlCommand) {
    FaceRecognitionSdkBridge.shared().getLandmarkMode({ value in
      self.succeed(command, ["value": value as? Int ?? 14])
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(detect:)
  func detect(_ command: CDVInvokedUrlCommand) {
    let o = opts(from: command)
    guard let image = o["image"] as? String, !image.isEmpty else {
      fail(command, "image is required", "E_IMAGE")
      return
    }
    let crop = o["crop"] as? Bool ?? false
    let flags = (o["flags"] as? NSNumber)?.intValue ?? -1
    FaceRecognitionSdkBridge.shared().detect(image, crop: crop, flags: NSNumber(value: flags), resolver: { value in
      self.succeed(command, ["value": value as? String ?? "{}"])
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(faceDetection:)
  func faceDetection(_ command: CDVInvokedUrlCommand) {
    let o = opts(from: command)
    guard let image = o["image"] as? String, !image.isEmpty else {
      fail(command, "image is required", "E_IMAGE")
      return
    }
    let param = o["param"] as? String
    FaceRecognitionSdkBridge.shared().faceDetection(image, paramJson: param, resolver: { value in
      self.succeed(command, ["value": value as? String ?? "[]"])
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(templateExtraction:)
  func templateExtraction(_ command: CDVInvokedUrlCommand) {
    let o = opts(from: command)
    guard let image = o["image"] as? String, let box = o["faceBox"] as? String else {
      fail(command, "image and faceBox are required", "E_TEMPLATE")
      return
    }
    FaceRecognitionSdkBridge.shared().templateExtraction(image, faceBoxJson: box, resolver: { value in
      self.succeed(command, ["value": value as? String ?? ""])
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(cropFace:)
  func cropFace(_ command: CDVInvokedUrlCommand) {
    let o = opts(from: command)
    guard let image = o["image"] as? String, let box = o["faceBox"] as? String else {
      fail(command, "image and faceBox are required", "E_CROP")
      return
    }
    FaceRecognitionSdkBridge.shared().cropFace(image, faceBoxJson: box, resolver: { value in
      self.succeed(command, ["value": value as? String ?? ""])
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(extractFeature:)
  func extractFeature(_ command: CDVInvokedUrlCommand) {
    guard let image = opts(from: command)["image"] as? String else {
      fail(command, "image is required", "E_FEATURE")
      return
    }
    FaceRecognitionSdkBridge.shared().extractFeature(image, resolver: { value in
      self.succeed(command, ["value": value as? String ?? "{}"])
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(similarity:)
  func similarity(_ command: CDVInvokedUrlCommand) {
    let o = opts(from: command)
    guard let f1 = o["feature1"] as? String, let f2 = o["feature2"] as? String else {
      fail(command, "feature1 and feature2 are required", "E_SIMILARITY")
      return
    }
    FaceRecognitionSdkBridge.shared().similarity(f1, feature2B64: f2, resolver: { value in
      self.succeed(command, ["value": value as? Double ?? -1])
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(quality:)
  func quality(_ command: CDVInvokedUrlCommand) {
    let o = opts(from: command)
    guard let image = o["image"] as? String else {
      fail(command, "image is required", "E_QUALITY")
      return
    }
    let crop = o["crop"] as? Bool ?? false
    FaceRecognitionSdkBridge.shared().quality(image, crop: crop, resolver: { value in
      self.succeed(command, ["value": value as? String ?? "{}"])
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(startVideoWorker:)
  func startVideoWorker(_ command: CDVInvokedUrlCommand) {
    if missingSdk(command) { return }
    let config = opts(from: command)["config"] as? String
    FaceRecognitionSdkBridge.shared().startVideoWorker(config, resolver: { value in
      self.succeed(command, ["value": value as? Int ?? 0])
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(stopVideoWorker:)
  func stopVideoWorker(_ command: CDVInvokedUrlCommand) {
    FaceRecognitionSdkBridge.shared().stopVideoWorker({ _ in
      self.succeedEmpty(command)
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(syncVideoWorkerDatabase:)
  func syncVideoWorkerDatabase(_ command: CDVInvokedUrlCommand) {
    let o = opts(from: command)
    let features = o["features"] as? [String] ?? []
    let threshold = (o["matchThreshold"] as? NSNumber)?.doubleValue ?? 0.67
    FaceRecognitionSdkBridge.shared().syncVideoWorkerDatabase(
      features,
      matchThreshold: NSNumber(value: threshold),
      resolver: { value in
        self.succeed(command, ["value": value as? Int ?? 0])
      },
      rejecter: { code, message, _ in
        self.fail(command, message ?? code ?? "error", code)
      }
    )
  }

  @objc(probeLiveImage:)
  func probeLiveImage(_ command: CDVInvokedUrlCommand) {
    guard let image = opts(from: command)["image"] as? String else {
      fail(command, "image is required", "E_IMAGE")
      return
    }
    FaceRecognitionSdkBridge.shared().probeLiveImage(image, resolver: { value in
      if let dict = value as? [String: Any] {
        self.succeed(command, dict)
      } else {
        self.succeed(command, ["width": 0, "height": 0])
      }
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(applyLiveFrame:)
  func applyLiveFrame(_ command: CDVInvokedUrlCommand) {
    let o = opts(from: command)
    guard let image = o["image"] as? String else {
      fail(command, "image is required", "E_FRAME")
      return
    }
    let rotate = (o["rotateDegrees"] as? NSNumber)?.doubleValue ?? 0
    let maxEdge = (o["maxEdge"] as? NSNumber)?.intValue ?? 640
    let feed = o["feedWorker"] as? Bool ?? true
    FaceRecognitionSdkBridge.shared().applyLiveFrame(
      image,
      rotateDegrees: NSNumber(value: rotate),
      maxEdge: NSNumber(value: maxEdge),
      feedWorker: feed,
      resolver: { value in
        if let dict = value as? [String: Any] {
          self.succeed(command, dict)
        } else {
          self.succeed(command, ["ingested": false, "width": 0, "height": 0])
        }
      },
      rejecter: { code, message, _ in
        self.fail(command, message ?? code ?? "error", code)
      }
    )
  }

  @objc(exportLastLiveFrame:)
  func exportLastLiveFrame(_ command: CDVInvokedUrlCommand) {
    FaceRecognitionSdkBridge.shared().exportLastLiveFrame({ value in
      if let dict = value as? [String: Any] {
        self.succeed(command, dict)
      } else {
        self.fail(command, "No live frame", "E_IMAGE")
      }
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(writeStatus:)
  func writeStatus(_ command: CDVInvokedUrlCommand) {
    let payload = opts(from: command)["payload"] as? String ?? "{}"
    FaceRecognitionSdkBridge.shared().writeStatus(payload, resolver: { _ in
      self.succeedEmpty(command)
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(estimatorStatus:)
  func estimatorStatus(_ command: CDVInvokedUrlCommand) {
    FaceRecognitionSdkBridge.shared().estimatorStatus({ value in
      self.succeed(command, ["value": value as? String ?? "{}"])
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? code ?? "error", code)
    })
  }

  @objc(requestCameraPermission:)
  func requestCameraPermission(_ command: CDVInvokedUrlCommand) {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      succeedEmpty(command)
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { granted in
        DispatchQueue.main.async {
          if granted {
            self.succeedEmpty(command)
          } else {
            self.fail(command, "Camera permission denied", "E_CAMERA")
          }
        }
      }
    case .denied, .restricted:
      fail(command, "Camera permission denied", "E_CAMERA")
    @unknown default:
      fail(command, "Camera permission denied", "E_CAMERA")
    }
  }

  @objc(startLivePreview:)
  func startLivePreview(_ command: CDVInvokedUrlCommand) {
    let front = opts(from: command)["frontCamera"] as? Bool ?? true
    DispatchQueue.main.async {
      self.stopSession()
      self.usingFrontCamera = front
      let session = AVCaptureSession()
      // 4:3 matches typical analysis frames and FILL_CENTER overlay math.
      session.sessionPreset = .photo
      let position: AVCaptureDevice.Position = front ? .front : .back
      guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position)
        ?? AVCaptureDevice.default(for: .video) else {
        self.fail(command, "No camera", "E_CAMERA")
        return
      }
      do {
        let input = try AVCaptureDeviceInput(device: device)
        if session.canAddInput(input) {
          session.addInput(input)
        }
        let output = AVCaptureVideoDataOutput()
        output.alwaysDiscardsLateVideoFrames = true
        output.videoSettings = [
          kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ]
        output.setSampleBufferDelegate(self, queue: self.videoQueue)
        if session.canAddOutput(output) {
          session.addOutput(output)
        }
        if let conn = output.connection(with: .video) {
          if conn.isVideoOrientationSupported {
            conn.videoOrientation = .portrait
          }
          if conn.isVideoMirroringSupported {
            conn.isVideoMirrored = false
          }
        }
        self.videoOutput = output
        self.captureSession = session
        guard self.attachPreview(session: session, front: front) else {
          self.stopSession()
          self.fail(command, "Could not attach camera preview", "E_CAMERA")
          return
        }
        self.setWebViewTransparent(true)
        DispatchQueue.global(qos: .userInitiated).async {
          session.startRunning()
          DispatchQueue.main.async {
            self.layoutPreview()
            self.applyPreviewConnection()
          }
          self.succeedEmpty(command)
        }
      } catch {
        self.fail(command, error.localizedDescription, "E_CAMERA")
      }
    }
  }

  @objc(stopLivePreview:)
  func stopLivePreview(_ command: CDVInvokedUrlCommand) {
    DispatchQueue.main.async {
      self.stopSession()
      self.succeedEmpty(command)
    }
  }

  @objc(takeLiveSnapshot:)
  func takeLiveSnapshot(_ command: CDVInvokedUrlCommand) {
    FaceRecognitionSdkBridge.shared().exportLastLiveFrame({ value in
      if let dict = value as? [String: Any], let uri = dict["uri"] as? String {
        self.succeed(command, [
          "uri": uri,
          "path": uri.replacingOccurrences(of: "file://", with: "")
        ])
      } else {
        self.fail(command, "Live preview is not running", "E_CAMERA")
      }
    }, rejecter: { code, message, _ in
      self.fail(command, message ?? "Live preview is not running", code ?? "E_CAMERA")
    })
  }

  public func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    let now = CACurrentMediaTime()
    if now - lastFrameTime < 0.12 || feeding {
      return
    }
    lastFrameTime = now
    feeding = true
    defer { feeding = false }
    guard let image = imageFromSampleBuffer(sampleBuffer) else { return }
    FaceRecognitionSdkBridge.shared().ingestCameraImage(image)
  }

  private func imageFromSampleBuffer(_ sampleBuffer: CMSampleBuffer) -> UIImage? {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return nil }
    let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
    guard let cgImage = ciContext.createCGImage(ciImage, from: ciImage.extent) else { return nil }
    return UIImage(cgImage: cgImage, scale: 1, orientation: .up)
  }

  private func attachPreview(session: AVCaptureSession, front: Bool) -> Bool {
    guard let webView = previewAnchorView else { return false }
    guard let host = webView.superview ?? self.viewController?.view else {
      return false
    }
    // Pin to the WebView frame (not the full host) so FILL_CENTER crop matches
    // the HTML overlay inside the Cordova WebView.
    let frame = webView.frame.isEmpty ? host.bounds : webView.frame
    let container = UIView(frame: frame)
    container.isUserInteractionEnabled = false
    container.backgroundColor = .black
    container.clipsToBounds = true

    let layer = AVCaptureVideoPreviewLayer(session: session)
    layer.videoGravity = .resizeAspectFill
    layer.frame = container.bounds
    if let conn = layer.connection {
      if conn.isVideoOrientationSupported {
        conn.videoOrientation = .portrait
      }
      if conn.isVideoMirroringSupported {
        conn.automaticallyAdjustsVideoMirroring = false
        conn.isVideoMirrored = front
      }
    }
    container.layer.addSublayer(layer)
    previewLayer = layer
    previewContainer = container

    if let idx = host.subviews.firstIndex(of: webView) {
      host.insertSubview(container, at: idx)
    } else {
      host.insertSubview(container, at: 0)
    }
    host.bringSubviewToFront(webView)

    boundsObserver?.invalidate()
    boundsObserver = webView.observe(\.frame, options: [.new, .initial]) { [weak self] view, _ in
      guard let self = self else { return }
      self.previewContainer?.frame = view.frame
      self.layoutPreview()
    }
    layoutPreview()
    return true
  }

  private func layoutPreview() {
    guard let container = previewContainer else { return }
    if let webView = previewAnchorView, !webView.frame.isEmpty {
      container.frame = webView.frame
    }
    previewLayer?.frame = container.bounds
    applyPreviewConnection()
  }

  private func applyPreviewConnection() {
    guard let conn = previewLayer?.connection else { return }
    if conn.isVideoOrientationSupported {
      conn.videoOrientation = .portrait
    }
    if conn.isVideoMirroringSupported {
      conn.automaticallyAdjustsVideoMirroring = false
      conn.isVideoMirrored = usingFrontCamera
    }
  }

  private func setWebViewTransparent(_ transparent: Bool) {
    if let wk = wkWebView {
      if originalWebViewOpaque == nil {
        originalWebViewOpaque = wk.isOpaque
      }
      wk.isOpaque = !transparent && (originalWebViewOpaque ?? true)
      wk.backgroundColor = transparent ? .clear : nil
      wk.scrollView.isOpaque = !transparent
      wk.scrollView.backgroundColor = transparent ? .clear : nil
      wk.scrollView.subviews.forEach { sub in
        if transparent {
          sub.backgroundColor = .clear
        }
      }
      return
    }
    guard let webView = self.webView else { return }
    if originalWebViewOpaque == nil {
      originalWebViewOpaque = webView.isOpaque
    }
    webView.isOpaque = !transparent && (originalWebViewOpaque ?? true)
    webView.backgroundColor = transparent ? .clear : nil
  }

  private func stopSession() {
    boundsObserver?.invalidate()
    boundsObserver = nil
    captureSession?.stopRunning()
    captureSession = nil
    videoOutput?.setSampleBufferDelegate(nil, queue: nil)
    videoOutput = nil
    previewLayer?.removeFromSuperlayer()
    previewLayer = nil
    previewContainer?.removeFromSuperview()
    previewContainer = nil
    setWebViewTransparent(false)
  }
}
