package com.facerecognitionsdk

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.os.SystemClock
import android.util.Base64
import android.view.View
import android.view.ViewGroup
import android.view.ViewParent
import android.widget.FrameLayout
import androidx.camera.core.AspectRatio
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.UseCaseGroup
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.faceplugin.facerecognitionsdk.FaceBox
import com.faceplugin.facerecognitionsdk.FaceDetectionParam
import com.faceplugin.facerecognitionsdk.FaceRecognitionSDK
import org.apache.cordova.CallbackContext
import org.apache.cordova.CordovaPlugin
import org.apache.cordova.PermissionHelper
import org.apache.cordova.PluginResult
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.Executors

class FaceRecognitionSdkPlugin : CordovaPlugin() {

  companion object {
    private const val REQ_CAMERA = 90212
    private const val TAG = "FaceRecCordova"
  }

  private val executor = Executors.newSingleThreadExecutor()
  private val analysisExecutor = Executors.newSingleThreadExecutor()
  @Volatile private var lastLiveBitmap: Bitmap? = null
  @Volatile private var nativesLoaded = false
  @Volatile private var analysisBusy = false
  @Volatile private var lastAnalysisMs = 0L

  private var cameraProvider: ProcessCameraProvider? = null
  private var previewView: PreviewView? = null
  private var previewHost: FrameLayout? = null
  private var pendingCameraCallback: CallbackContext? = null
  private var pendingFrontCamera: Boolean = true
  private var pendingStartAfterPermission: Boolean = false

  /** Cordova keepCallback for VideoWorker events (Capacitor notifyListeners equivalent). */
  private var videoWorkerCallback: CallbackContext? = null

  override fun pluginInitialize() {
    preloadNatives()
  }

  override fun execute(action: String, args: JSONArray, callbackContext: CallbackContext): Boolean {
    val opts = args.optJSONObject(0) ?: JSONObject()
    when (action) {
      "getMachineCode" -> getMachineCode(callbackContext)
      "setActivation" -> setActivation(opts, callbackContext)
      "init" -> init(callbackContext)
      "deinit" -> deinit(callbackContext)
      "lastLicenseError" -> lastLicenseError(callbackContext)
      "setLandmarkMode" -> setLandmarkMode(opts, callbackContext)
      "getLandmarkMode" -> getLandmarkMode(callbackContext)
      "detect" -> detect(opts, callbackContext)
      "faceDetection" -> faceDetection(opts, callbackContext)
      "templateExtraction" -> templateExtraction(opts, callbackContext)
      "cropFace" -> cropFace(opts, callbackContext)
      "extractFeature" -> extractFeature(opts, callbackContext)
      "similarity" -> similarity(opts, callbackContext)
      "quality" -> quality(opts, callbackContext)
      "startVideoWorker" -> startVideoWorker(opts, callbackContext)
      "stopVideoWorker" -> stopVideoWorker(callbackContext)
      "syncVideoWorkerDatabase" -> syncVideoWorkerDatabase(opts, callbackContext)
      "probeLiveImage" -> probeLiveImage(opts, callbackContext)
      "applyLiveFrame" -> applyLiveFrame(opts, callbackContext)
      "exportLastLiveFrame" -> exportLastLiveFrame(opts, callbackContext)
      "writeStatus" -> writeStatus(opts, callbackContext)
      "estimatorStatus" -> estimatorStatus(callbackContext)
      "startLivePreview" -> startLivePreview(opts, callbackContext)
      "stopLivePreview" -> stopLivePreview(callbackContext)
      "takeLiveSnapshot" -> takeLiveSnapshot(callbackContext)
      "addVideoWorkerListener" -> addVideoWorkerListener(callbackContext)
      "removeVideoWorkerListener" -> removeVideoWorkerListener(callbackContext)
      "requestCameraPermission" -> requestCameraPermission(callbackContext)
      else -> return false
    }
    return true
  }

  override fun onRequestPermissionResult(
    requestCode: Int,
    permissions: Array<out String>?,
    grantResults: IntArray?
  ) {
    if (requestCode != REQ_CAMERA) return
    val cb = pendingCameraCallback ?: return
    val startAfter = pendingStartAfterPermission
    pendingCameraCallback = null
    pendingStartAfterPermission = false
    val granted =
      grantResults != null &&
        grantResults.isNotEmpty() &&
        grantResults[0] == PackageManager.PERMISSION_GRANTED
    if (!granted) {
      cb.error("E_CAMERA: Camera permission denied")
      return
    }
    if (startAfter) {
      beginLivePreview(pendingFrontCamera, cb)
    } else {
      cb.success()
    }
  }

  fun requestCameraPermission(callbackContext: CallbackContext) {
    val activity = cordova.activity
    if (activity == null) {
      callbackContext.error("E_CAMERA: No activity")
      return
    }
    if (
      ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) ==
        PackageManager.PERMISSION_GRANTED
    ) {
      callbackContext.success()
      return
    }
    pendingStartAfterPermission = false
    pendingCameraCallback = callbackContext
    PermissionHelper.requestPermission(this, REQ_CAMERA, Manifest.permission.CAMERA)
  }

  private fun preloadNatives() {
    if (nativesLoaded) return
    val names = arrayOf(
      "c++_shared",
      "onnxruntime",
      "FaceRecognitionEngine",
      "FaceRecognitionEngine_jni",
      "FaceRecognitionSDK"
    )
    val libDir = cordova.context.applicationInfo.nativeLibraryDir
    for (name in names) {
      try {
        System.loadLibrary(name)
        android.util.Log.i(TAG, "preload ok: $name")
      } catch (e: UnsatisfiedLinkError) {
        android.util.Log.w(TAG, "preload loadLibrary failed: $name", e)
        try {
          System.load("$libDir/lib$name.so")
          android.util.Log.i(TAG, "preload ok path: lib$name.so")
        } catch (e2: UnsatisfiedLinkError) {
          android.util.Log.e(TAG, "preload failed: lib$name.so", e2)
        }
      }
    }
    nativesLoaded = true
  }

  fun getMachineCode(callbackContext: CallbackContext) {
    executor.execute {
      try {
        preloadNatives()
        val mc = FaceRecognitionSDK.getMachineCode(cordova.context.applicationContext) ?: ""
        callbackContext.success(value(mc))
      } catch (t: Throwable) {
        reject(callbackContext, "E_MACHINE_CODE", t)
      }
    }
  }

  fun setActivation(opts: JSONObject, callbackContext: CallbackContext) {
    val license = opts.stringOrNull("license")
    if (license.isNullOrBlank()) {
      callbackContext.error("E_ACTIVATION: license is required")
      return
    }
    executor.execute {
      try {
        preloadNatives()
        val code = FaceRecognitionSDK.setActivation(cordova.context.applicationContext, license)
        callbackContext.success(value(code))
      } catch (t: Throwable) {
        reject(callbackContext, "E_ACTIVATION", t)
      }
    }
  }

  fun init(callbackContext: CallbackContext) {
    executor.execute {
      try {
        preloadNatives()
        val code = FaceRecognitionSDK.init(cordova.context.applicationContext)
        callbackContext.success(value(code))
      } catch (t: Throwable) {
        reject(callbackContext, "E_INIT", t)
      }
    }
  }

  fun deinit(callbackContext: CallbackContext) {
    executor.execute {
      try {
        FaceRecognitionSDK.deinit()
        callbackContext.success()
      } catch (t: Throwable) {
        reject(callbackContext, "E_DEINIT", t)
      }
    }
  }

  fun lastLicenseError(callbackContext: CallbackContext) {
    try {
      callbackContext.success(value(FaceRecognitionSDK.lastLicenseError() ?: ""))
    } catch (t: Throwable) {
      reject(callbackContext, "E_LICENSE_ERROR", t)
    }
  }

  fun setLandmarkMode(opts: JSONObject, callbackContext: CallbackContext) {
    val mode = if (opts.has("mode")) opts.getInt("mode") else 14
    executor.execute {
      try {
        callbackContext.success(value(FaceRecognitionSDK.setLandmarkMode(mode)))
      } catch (t: Throwable) {
        reject(callbackContext, "E_LANDMARK", t)
      }
    }
  }

  fun getLandmarkMode(callbackContext: CallbackContext) {
    executor.execute {
      try {
        callbackContext.success(value(FaceRecognitionSDK.getLandmarkMode()))
      } catch (t: Throwable) {
        reject(callbackContext, "E_LANDMARK", t)
      }
    }
  }

  fun detect(opts: JSONObject, callbackContext: CallbackContext) {
    val imageUri = opts.stringOrNull("image")
    if (imageUri.isNullOrBlank()) {
      callbackContext.error("E_IMAGE: image is required")
      return
    }
    val crop = if (opts.has("crop")) opts.getBoolean("crop") else false
    val flags = if (opts.has("flags")) opts.getInt("flags") else -1
    executor.execute {
      try {
        val bitmap = loadEngineBitmap(imageUri) ?: run {
          callbackContext.error("E_IMAGE: Could not decode image: $imageUri")
          return@execute
        }
        val json = if (flags < 0 || flags == FaceRecognitionSDK.DETECT_ALL) {
          FaceRecognitionSDK.detect(bitmap, crop, FaceRecognitionSDK.DETECT_ALL)
        } else {
          FaceRecognitionSDK.detect(bitmap, crop, flags)
        }
        callbackContext.success(value(json ?: "{}"))
      } catch (t: Throwable) {
        reject(callbackContext, "E_DETECT", t)
      }
    }
  }

  fun faceDetection(opts: JSONObject, callbackContext: CallbackContext) {
    val imageUri = opts.stringOrNull("image")
    if (imageUri.isNullOrBlank()) {
      callbackContext.error("E_IMAGE: image is required")
      return
    }
    val paramJson = opts.stringOrNull("param")
    executor.execute {
      try {
        val bitmap = loadEngineBitmap(imageUri) ?: run {
          callbackContext.error("E_IMAGE: Could not decode image: $imageUri")
          return@execute
        }
        val boxes = FaceRecognitionSDK.faceDetection(bitmap, parseParam(paramJson))
        callbackContext.success(value(boxesToJson(boxes)))
      } catch (t: Throwable) {
        reject(callbackContext, "E_FACE_DETECTION", t)
      }
    }
  }

  fun templateExtraction(opts: JSONObject, callbackContext: CallbackContext) {
    val imageUri = opts.stringOrNull("image")
    val faceBoxJson = opts.stringOrNull("faceBox")
    if (imageUri.isNullOrBlank() || faceBoxJson.isNullOrBlank()) {
      callbackContext.error("E_TEMPLATE: image and faceBox are required")
      return
    }
    executor.execute {
      try {
        val bitmap = loadEngineBitmap(imageUri) ?: run {
          callbackContext.error("E_IMAGE: Could not decode image: $imageUri")
          return@execute
        }
        val face = jsonToFaceBox(faceBoxJson) ?: run {
          callbackContext.error("E_FACE: Invalid face box JSON")
          return@execute
        }
        val bytes = FaceRecognitionSDK.templateExtraction(bitmap, face)
        if (bytes == null) {
          callbackContext.error("E_TEMPLATE: templateExtraction returned null")
          return@execute
        }
        callbackContext.success(value(Base64.encodeToString(bytes, Base64.NO_WRAP)))
      } catch (t: Throwable) {
        reject(callbackContext, "E_TEMPLATE", t)
      }
    }
  }

  fun cropFace(opts: JSONObject, callbackContext: CallbackContext) {
    val imageUri = opts.stringOrNull("image")
    val faceBoxJson = opts.stringOrNull("faceBox")
    if (imageUri.isNullOrBlank() || faceBoxJson.isNullOrBlank()) {
      callbackContext.error("E_CROP: image and faceBox are required")
      return
    }
    executor.execute {
      try {
        val bitmap = loadEngineBitmap(imageUri) ?: run {
          callbackContext.error("E_IMAGE: Could not decode image: $imageUri")
          return@execute
        }
        val face = jsonToFaceBox(faceBoxJson) ?: run {
          callbackContext.error("E_FACE: Invalid face box JSON")
          return@execute
        }
        val cropped = FaceRecognitionSDK.cropFace(bitmap, face) ?: run {
          callbackContext.error("E_CROP: cropFace returned null")
          return@execute
        }
        callbackContext.success(value(bitmapToBase64Jpeg(cropped)))
      } catch (t: Throwable) {
        reject(callbackContext, "E_CROP", t)
      }
    }
  }

  fun extractFeature(opts: JSONObject, callbackContext: CallbackContext) {
    val imageUri = opts.stringOrNull("image")
    if (imageUri.isNullOrBlank()) {
      callbackContext.error("E_FEATURE: image is required")
      return
    }
    executor.execute {
      try {
        val bitmap = loadEngineBitmap(imageUri) ?: run {
          callbackContext.error("E_IMAGE: Could not decode image: $imageUri")
          return@execute
        }
        callbackContext.success(value(FaceRecognitionSDK.extractFeature(bitmap) ?: "{}"))
      } catch (t: Throwable) {
        reject(callbackContext, "E_FEATURE", t)
      }
    }
  }

  fun similarity(opts: JSONObject, callbackContext: CallbackContext) {
    val f1b64 = opts.stringOrNull("feature1")
    val f2b64 = opts.stringOrNull("feature2")
    if (f1b64.isNullOrBlank() || f2b64.isNullOrBlank()) {
      callbackContext.error("E_SIMILARITY: feature1 and feature2 are required")
      return
    }
    executor.execute {
      try {
        val f1 = Base64.decode(f1b64, Base64.DEFAULT)
        val f2 = Base64.decode(f2b64, Base64.DEFAULT)
        callbackContext.success(value(FaceRecognitionSDK.similarity(f1, f2).toDouble()))
      } catch (t: Throwable) {
        reject(callbackContext, "E_SIMILARITY", t)
      }
    }
  }

  fun quality(opts: JSONObject, callbackContext: CallbackContext) {
    val imageUri = opts.stringOrNull("image")
    if (imageUri.isNullOrBlank()) {
      callbackContext.error("E_QUALITY: image is required")
      return
    }
    val crop = if (opts.has("crop")) opts.getBoolean("crop") else false
    executor.execute {
      try {
        val bitmap = loadEngineBitmap(imageUri) ?: run {
          callbackContext.error("E_IMAGE: Could not decode image: $imageUri")
          return@execute
        }
        callbackContext.success(value(FaceRecognitionSDK.quality(bitmap, crop) ?: "{}"))
      } catch (t: Throwable) {
        reject(callbackContext, "E_QUALITY", t)
      }
    }
  }

  fun startVideoWorker(opts: JSONObject, callbackContext: CallbackContext) {
    val configJson = opts.stringOrNull("config")
    executor.execute {
      try {
        FaceRecognitionSDK.setVideoWorkerEventHandler { json ->
          emitVideoWorkerEvent(json)
        }
        val threshold = parseMatchThreshold(configJson)
        val code = FaceRecognitionSDK.startVideoWorker(threshold)
        callbackContext.success(value(code))
      } catch (t: Throwable) {
        reject(callbackContext, "E_VIDEO_WORKER", t)
      }
    }
  }

  fun stopVideoWorker(callbackContext: CallbackContext) {
    executor.execute {
      try {
        FaceRecognitionSDK.stopVideoWorker()
        FaceRecognitionSDK.setVideoWorkerEventHandler(null)
        callbackContext.success()
      } catch (t: Throwable) {
        reject(callbackContext, "E_VIDEO_WORKER", t)
      }
    }
  }

  fun syncVideoWorkerDatabase(opts: JSONObject, callbackContext: CallbackContext) {
    val threshold = if (opts.has("matchThreshold")) opts.getDouble("matchThreshold") else 0.67
    val features = opts.optJSONArray("features") ?: JSONArray()
    executor.execute {
      try {
        val list = ArrayList<ByteArray>()
        for (i in 0 until features.length()) {
          if (features.isNull(i)) continue
          val s = features.optString(i)
          if (s.isBlank()) continue
          list.add(Base64.decode(s, Base64.DEFAULT))
        }
        val code = FaceRecognitionSDK.syncVideoWorkerDatabase(list, threshold.toFloat())
        callbackContext.success(value(code))
      } catch (t: Throwable) {
        reject(callbackContext, "E_SYNC_DB", t)
      }
    }
  }

  fun probeLiveImage(opts: JSONObject, callbackContext: CallbackContext) {
    val imageUri = opts.stringOrNull("image")
    if (imageUri.isNullOrBlank()) {
      callbackContext.error("E_IMAGE: image is required")
      return
    }
    executor.execute {
      try {
        val bitmap = loadBitmap(imageUri) ?: run {
          callbackContext.error("E_IMAGE: Could not decode image: $imageUri")
          return@execute
        }
        val ret = JSONObject()
        ret.put("width", bitmap.width)
        ret.put("height", bitmap.height)
        callbackContext.success(ret)
      } catch (t: Throwable) {
        reject(callbackContext, "E_IMAGE", t)
      }
    }
  }

  fun applyLiveFrame(opts: JSONObject, callbackContext: CallbackContext) {
    val imageUri = opts.stringOrNull("image")
    if (imageUri.isNullOrBlank()) {
      callbackContext.error("E_FRAME: image is required")
      return
    }
    val rotateDegrees =
      (if (opts.has("rotateDegrees")) opts.getDouble("rotateDegrees") else 0.0).toFloat()
    val maxEdge =
      (if (opts.has("maxEdge")) opts.getInt("maxEdge") else 640).coerceAtLeast(1)
    val feedWorker = if (opts.has("feedWorker")) opts.getBoolean("feedWorker") else true
    executor.execute {
      try {
        val bitmap = loadBitmap(imageUri) ?: run {
          callbackContext.error("E_IMAGE: Could not decode image: $imageUri")
          return@execute
        }
        val prepared = applyLiveTransform(bitmap, rotateDegrees, maxEdge)
        lastLiveBitmap = prepared
        if (feedWorker) {
          FaceRecognitionSDK.addVideoWorkerFrame(prepared)
          callbackContext.success(liveFrameMap(prepared, ingested = true, uri = null))
        } else {
          callbackContext.success(
            liveFrameMap(prepared, ingested = true, uri = writeLiveJpeg(prepared))
          )
        }
      } catch (t: Throwable) {
        reject(callbackContext, "E_FRAME", t)
      }
    }
  }

  fun exportLastLiveFrame(opts: JSONObject, callbackContext: CallbackContext) {
    val withPreview = opts.optBoolean("preview", false)
    executor.execute {
      try {
        val prepared = lastLiveBitmap ?: run {
          callbackContext.error("E_IMAGE: No live frame")
          return@execute
        }
        // Freeze a software copy — analysis keeps replacing lastLiveBitmap.
        val still = prepared.copy(Bitmap.Config.ARGB_8888, false) ?: prepared
        val uri = writeLiveJpeg(still)
        val map = liveFrameMap(still, ingested = true, uri = uri)
        // Cordova WebView cannot load file://; ship a compact base64 still for <img>.
        if (withPreview) {
          val preview = scaleMax(still, 360)
          map.put("previewB64", bitmapToBase64Jpeg(preview, 70))
          if (preview !== still && !preview.isRecycled) preview.recycle()
        }
        if (still !== prepared && !still.isRecycled) still.recycle()
        callbackContext.success(map)
      } catch (t: Throwable) {
        reject(callbackContext, "E_FRAME", t)
      }
    }
  }

  fun writeStatus(opts: JSONObject, callbackContext: CallbackContext) {
    val json = opts.stringOrNull("payload") ?: "{}"
    try {
      File(cordova.context.filesDir, "facerecognition_status.json").writeText(json)
      callbackContext.success()
    } catch (t: Throwable) {
      reject(callbackContext, "E_STATUS", t)
    }
  }

  fun estimatorStatus(callbackContext: CallbackContext) {
    executor.execute {
      try {
        callbackContext.success(value(FaceRecognitionSDK.estimatorStatusJSON() ?: "{}"))
      } catch (t: Throwable) {
        reject(callbackContext, "E_ESTIMATOR", t)
      }
    }
  }

  fun startLivePreview(opts: JSONObject, callbackContext: CallbackContext) {
    val front = if (opts.has("frontCamera")) opts.getBoolean("frontCamera") else true
    val activity = cordova.activity
    if (activity == null) {
      callbackContext.error("E_CAMERA: No activity")
      return
    }
    if (
      ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) !=
        PackageManager.PERMISSION_GRANTED
    ) {
      pendingFrontCamera = front
      pendingStartAfterPermission = true
      pendingCameraCallback = callbackContext
      PermissionHelper.requestPermission(this, REQ_CAMERA, Manifest.permission.CAMERA)
      return
    }
    beginLivePreview(front, callbackContext)
  }

  private fun beginLivePreview(front: Boolean, callbackContext: CallbackContext) {
    val activity = cordova.activity
    if (activity == null) {
      callbackContext.error("E_CAMERA: No activity")
      return
    }
    activity.runOnUiThread {
      try {
        attachPreviewHost()
        val previewView = previewView ?: run {
          callbackContext.error("E_CAMERA: Preview view missing")
          return@runOnUiThread
        }
        // Wait for layout so ViewPort matches the WebView / overlay size.
        previewView.post {
          bindCameraUseCases(front, callbackContext)
        }
      } catch (t: Throwable) {
        reject(callbackContext, "E_CAMERA", t)
      }
    }
  }

  private fun bindCameraUseCases(front: Boolean, callbackContext: CallbackContext) {
    val activity = cordova.activity ?: run {
      callbackContext.error("E_CAMERA: No activity")
      return
    }
    val previewView = previewView ?: run {
      callbackContext.error("E_CAMERA: Preview view missing")
      return
    }
    val appContext = cordova.context
    val future = ProcessCameraProvider.getInstance(appContext)
    future.addListener({
      try {
        val provider = future.get()
        cameraProvider?.unbindAll()
        cameraProvider = provider
        syncPreviewHostToWebView()

        val preview = Preview.Builder()
          .setTargetAspectRatio(AspectRatio.RATIO_4_3)
          .build()
          .also { it.setSurfaceProvider(previewView.surfaceProvider) }

        val analysis = ImageAnalysis.Builder()
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
          .setTargetAspectRatio(AspectRatio.RATIO_4_3)
          .build()
        analysis.setAnalyzer(analysisExecutor) { image ->
          ingestAnalysisFrame(image)
        }

        val selector = if (front) {
          CameraSelector.DEFAULT_FRONT_CAMERA
        } else {
          CameraSelector.DEFAULT_BACK_CAMERA
        }

        // Shared ViewPort = Preview and Analysis crop identically (FILL_CENTER).
        val viewPort = previewView.viewPort
        if (viewPort != null) {
          val group = UseCaseGroup.Builder()
            .addUseCase(preview)
            .addUseCase(analysis)
            .setViewPort(viewPort)
            .build()
          provider.bindToLifecycle(activity as LifecycleOwner, selector, group)
        } else {
          provider.bindToLifecycle(
            activity as LifecycleOwner,
            selector,
            preview,
            analysis
          )
        }
        setWebViewTransparent(true)
        callbackContext.success()
      } catch (t: Throwable) {
        reject(callbackContext, "E_CAMERA", t)
      }
    }, ContextCompat.getMainExecutor(appContext))
  }

  fun stopLivePreview(callbackContext: CallbackContext) {
    val activity = cordova.activity
    if (activity == null) {
      cameraProvider = null
      callbackContext.success()
      return
    }
    activity.runOnUiThread {
      try {
        cameraProvider?.unbindAll()
        setWebViewTransparent(false)
        detachPreviewHost()
        callbackContext.success()
      } catch (t: Throwable) {
        reject(callbackContext, "E_CAMERA", t)
      }
    }
  }

  fun takeLiveSnapshot(callbackContext: CallbackContext) {
    executor.execute {
      try {
        val prepared = lastLiveBitmap ?: run {
          callbackContext.error("E_CAMERA: Live preview is not running")
          return@execute
        }
        val uri = writeLiveJpeg(prepared)
        val ret = JSONObject()
        ret.put("uri", uri)
        ret.put("path", uri.removePrefix("file://"))
        callbackContext.success(ret)
      } catch (t: Throwable) {
        reject(callbackContext, "E_CAMERA", t)
      }
    }
  }

  fun addVideoWorkerListener(callbackContext: CallbackContext) {
    videoWorkerCallback = callbackContext
    val result = PluginResult(PluginResult.Status.NO_RESULT)
    result.keepCallback = true
    callbackContext.sendPluginResult(result)
  }

  fun removeVideoWorkerListener(callbackContext: CallbackContext) {
    videoWorkerCallback = null
    callbackContext.success()
  }

  private fun emitVideoWorkerEvent(json: String?) {
    val cb = videoWorkerCallback ?: return
    val data = JSONObject()
    data.put("json", json ?: "{}")
    val result = PluginResult(PluginResult.Status.OK, data)
    result.keepCallback = true
    cb.sendPluginResult(result)
  }

  private fun ingestAnalysisFrame(image: androidx.camera.core.ImageProxy) {
    val now = SystemClock.elapsedRealtime()
    if (now - lastAnalysisMs < 120L || analysisBusy) {
      image.close()
      return
    }
    analysisBusy = true
    lastAnalysisMs = now
    try {
      val bitmap = ImageUtils.bitmapFromImageProxy(image) ?: return
      val prepared = applyLiveTransform(bitmap, 0f, 640)
      if (prepared !== bitmap && !bitmap.isRecycled) {
        bitmap.recycle()
      }
      lastLiveBitmap = prepared
      try {
        FaceRecognitionSDK.addVideoWorkerFrame(prepared)
      } catch (_: Throwable) {
        // Worker may not be running yet.
      }
    } catch (_: Throwable) {
      // Drop a bad preview frame.
    } finally {
      image.close()
      analysisBusy = false
    }
  }

  private fun androidWebView(): android.view.View? {
    return webView?.view as? android.view.View
  }

  private fun attachPreviewHost() {
    val activity = cordova.activity ?: return
    val webView = androidWebView() ?: return
    val parent = webView.parent as? ViewGroup ?: return
    if (previewHost != null) {
      syncPreviewHostToWebView()
      return
    }
    val host = FrameLayout(activity)
    host.setBackgroundColor(Color.BLACK)
    val view = PreviewView(activity)
    view.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    view.scaleType = PreviewView.ScaleType.FILL_CENTER
    host.addView(
      view,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    )
    // Match WebView frame so FILL_CENTER crop matches the HTML overlay.
    val lp = ViewGroup.MarginLayoutParams(
      if (webView.width > 0) webView.width else ViewGroup.LayoutParams.MATCH_PARENT,
      if (webView.height > 0) webView.height else ViewGroup.LayoutParams.MATCH_PARENT
    )
    lp.leftMargin = webView.left
    lp.topMargin = webView.top
    parent.addView(host, 0, lp)
    host.isClickable = false
    host.isFocusable = false
    view.isClickable = false
    webView.bringToFront()
    previewHost = host
    previewView = view
    webView.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
      syncPreviewHostToWebView()
    }
  }

  private fun syncPreviewHostToWebView() {
    val webView = androidWebView() ?: return
    val host = previewHost ?: return
    val lp = host.layoutParams as? ViewGroup.MarginLayoutParams ?: return
    if (webView.width <= 0 || webView.height <= 0) return
    if (
      lp.width == webView.width &&
      lp.height == webView.height &&
      lp.leftMargin == webView.left &&
      lp.topMargin == webView.top
    ) {
      return
    }
    lp.width = webView.width
    lp.height = webView.height
    lp.leftMargin = webView.left
    lp.topMargin = webView.top
    host.layoutParams = lp
  }

  private fun detachPreviewHost() {
    val host = previewHost ?: return
    (host.parent as? ViewGroup)?.removeView(host)
    previewHost = null
    previewView = null
  }

  private fun setWebViewTransparent(transparent: Boolean) {
    val webView = androidWebView() ?: return
    val color = if (transparent) Color.TRANSPARENT else Color.BLACK
    webView.setBackgroundColor(color)
    webView.setLayerType(
      if (transparent) View.LAYER_TYPE_NONE else View.LAYER_TYPE_HARDWARE,
      null
    )
    if (webView is android.webkit.WebView) {
      webView.setBackgroundColor(color)
    }
    var parent: ViewParent? = webView.parent
    var depth = 0
    while (parent is View && depth < 6) {
      val v = parent as View
      v.setBackgroundColor(color)
      parent = v.parent
      depth++
    }
    cordova.activity?.window?.decorView?.setBackgroundColor(color)
    webView.bringToFront()
  }

  private fun value(v: Any): JSONObject {
    val ret = JSONObject()
    ret.put("value", v)
    return ret
  }

  private fun reject(cb: CallbackContext, code: String, t: Throwable) {
    val msg = t.message ?: code
    cb.error("$code: $msg")
  }

  private fun loadBitmap(uriOrBase64: String): Bitmap? {
    return if (uriOrBase64.startsWith("data:") || looksLikeBase64(uriOrBase64)) {
      ImageUtils.bitmapFromBase64(uriOrBase64)
    } else {
      ImageUtils.bitmapFromUri(cordova.context.applicationContext, uriOrBase64)
    }
  }

  /** Decode + engine prepare (≤1280) so detect boxes and cropFace share one coordinate space. */
  private fun loadEngineBitmap(uriOrBase64: String): Bitmap? {
    val raw = loadBitmap(uriOrBase64) ?: return null
    return ImageUtils.enginePreparedImage(raw)
  }

  private fun looksLikeBase64(s: String): Boolean {
    if (s.startsWith("content:") || s.startsWith("file:") || s.startsWith("/")) return false
    return s.length > 256 && !s.contains("://")
  }

  private fun parseParam(paramJson: String?): FaceDetectionParam {
    if (paramJson.isNullOrBlank()) return FaceDetectionParam()
    return try {
      val o = JSONObject(paramJson)
      if (o.optBoolean("allAttributes", false)) {
        return FaceDetectionParam.allAttributes().also {
          if (o.has("check_liveness_level")) {
            it.check_liveness_level = o.optInt("check_liveness_level", 0)
          }
        }
      }
      FaceDetectionParam().apply {
        check_liveness = o.optBoolean("check_liveness", check_liveness)
        check_liveness_level = o.optInt("check_liveness_level", check_liveness_level)
        check_eye_closeness = o.optBoolean("check_eye_closeness", check_eye_closeness)
        check_face_occlusion = o.optBoolean("check_face_occlusion", check_face_occlusion)
        estimate_age_gender = o.optBoolean("estimate_age_gender", estimate_age_gender)
        check_pose = o.optBoolean("check_pose", check_pose)
        check_landmarks = o.optBoolean("check_landmarks", check_landmarks)
        check_quality = o.optBoolean("check_quality", check_quality)
        check_emotion = o.optBoolean("check_emotion", check_emotion)
        check_mask = o.optBoolean("check_mask", check_mask)
        check_glasses = o.optBoolean("check_glasses", check_glasses)
      }
    } catch (_: Exception) {
      FaceDetectionParam()
    }
  }

  private fun boxesToJson(boxes: List<FaceBox>): String {
    val arr = JSONArray()
    for (b in boxes) {
      arr.put(faceBoxToJson(b))
    }
    return arr.toString()
  }

  private fun faceBoxToJson(b: FaceBox): JSONObject {
    val o = JSONObject()
    o.put("x1", b.x1)
    o.put("y1", b.y1)
    o.put("x2", b.x2)
    o.put("y2", b.y2)
    o.put("yaw", b.yaw.toDouble())
    o.put("roll", b.roll.toDouble())
    o.put("pitch", b.pitch.toDouble())
    o.put("liveness", b.liveness.toDouble())
    o.put("face_quality", b.face_quality.toDouble())
    o.put("face_luminance", b.face_luminance.toDouble())
    o.put("left_eye_closed", b.left_eye_closed.toDouble())
    o.put("right_eye_closed", b.right_eye_closed.toDouble())
    o.put("face_occlusion", b.face_occlusion.toDouble())
    o.put("mouth_opened", b.mouth_opened.toDouble())
    o.put("age", b.age)
    o.put("gender", b.gender)
    o.put("livenessLabel", b.livenessLabel ?: "")
    o.put("genderLabel", b.genderLabel ?: "")
    o.put("emotionLabel", b.emotionLabel ?: "")
    o.put("maskLabel", b.maskLabel ?: "")
    o.put("qualityLabel", b.qualityLabel ?: "")
    o.put("eyesLeftLabel", b.eyesLeftLabel ?: "")
    o.put("eyesRightLabel", b.eyesRightLabel ?: "")
    val attrs = JSONObject()
    for ((key, value) in b.extraAttributes) {
      if (key.isNotBlank() && !value.isNullOrBlank()) {
        attrs.put(key, value)
      }
    }
    o.put("attributes", attrs)
    o.put("glassesLabel", b.extraAttributes["Glasses"] ?: b.extraAttributes["glasses"] ?: "")
    o.put("sunglassesLabel", b.extraAttributes["Sunglasses"] ?: b.extraAttributes["sunglasses"] ?: "")
    o.put(
      "occlusionLabel",
      b.extraAttributes["Occlusion"]
        ?: b.extraAttributes["FaceOcclusion"]
        ?: b.extraAttributes["occlusion"]
        ?: ""
    )
    o.put("landmarkCount", b.landmarkCount)
    val lm = JSONArray()
    val n = (b.landmarkCount * 2).coerceAtMost(b.landmarks_68.size)
    for (i in 0 until n) {
      lm.put(b.landmarks_68[i].toDouble())
    }
    o.put("landmarks", lm)
    return o
  }

  private fun jsonToFaceBox(json: String): FaceBox? {
    return try {
      val o = JSONObject(json)
      FaceBox().apply {
        x1 = o.optDouble("x1").toInt()
        y1 = o.optDouble("y1").toInt()
        x2 = o.optDouble("x2").toInt()
        y2 = o.optDouble("y2").toInt()
        yaw = o.optDouble("yaw").toFloat()
        roll = o.optDouble("roll").toFloat()
        pitch = o.optDouble("pitch").toFloat()
        liveness = o.optDouble("liveness").toFloat()
        face_quality = o.optDouble("face_quality").toFloat()
        left_eye_closed = o.optDouble("left_eye_closed").toFloat()
        right_eye_closed = o.optDouble("right_eye_closed").toFloat()
        face_occlusion = o.optDouble("face_occlusion").toFloat()
        age = o.optInt("age")
        gender = o.optInt("gender")
        landmarkCount = o.optInt("landmarkCount")
        val lm = o.optJSONArray("landmarks")
        if (lm != null) {
          val n = lm.length().coerceAtMost(landmarks_68.size)
          for (i in 0 until n) {
            landmarks_68[i] = lm.optDouble(i).toFloat()
          }
        }
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun parseMatchThreshold(configJson: String?): Float {
    if (configJson.isNullOrBlank()) return 0.67f
    return try {
      JSONObject(configJson).optDouble("matchThreshold", 0.67).toFloat()
    } catch (_: Exception) {
      0.67f
    }
  }

  private fun bitmapToBase64Jpeg(bitmap: Bitmap, quality: Int = 85): String {
    val out = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.JPEG, quality.coerceIn(40, 95), out)
    return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
  }

  private fun liveFrameMap(prepared: Bitmap, ingested: Boolean, uri: String?): JSONObject {
    val map = JSONObject()
    map.put("ingested", ingested)
    map.put("width", prepared.width)
    map.put("height", prepared.height)
    if (uri != null) map.put("uri", uri) else map.put("uri", JSONObject.NULL)
    return map
  }

  private fun writeLiveJpeg(prepared: Bitmap): String {
    // file:// for native detect/crop and for sideLoop (must stay small over the bridge).
    // WebView preview uses cropFace base64 / display helpers — do not ship data: every frame.
    val file = File(cordova.context.cacheDir, "frs_live_${System.currentTimeMillis()}.jpg")
    file.outputStream().use { out ->
      prepared.compress(Bitmap.CompressFormat.JPEG, 85, out)
    }
    return "file://${file.absolutePath}"
  }

  private fun applyLiveTransform(src: Bitmap, rotateDegrees: Float, maxEdge: Int): Bitmap {
    var frame = src
    val deg = rotateDegrees % 360f
    if (kotlin.math.abs(deg) > 0.01f) {
      val matrix = android.graphics.Matrix().apply { postRotate(deg) }
      val rotated = Bitmap.createBitmap(frame, 0, 0, frame.width, frame.height, matrix, true)
      if (rotated !== frame && frame !== src) frame.recycle()
      frame = rotated
    }
    return scaleMax(frame, maxEdge)
  }

  private fun scaleMax(src: Bitmap, maxEdge: Int): Bitmap {
    val w = src.width
    val h = src.height
    val edge = maxOf(w, h)
    if (edge <= maxEdge) return src
    val scale = maxEdge.toFloat() / edge
    return Bitmap.createScaledBitmap(src, (w * scale).toInt(), (h * scale).toInt(), true)
  }

  private fun JSONObject.stringOrNull(key: String): String? {
    if (!has(key) || isNull(key)) return null
    return getString(key)
  }
}
