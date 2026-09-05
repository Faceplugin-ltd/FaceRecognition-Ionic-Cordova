package com.facerecognitionsdk

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import android.net.Uri
import android.util.Base64
import androidx.camera.core.ImageProxy
import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream

internal object ImageUtils {
  /** Same long-side cap as FaceRecognitionSDK bitmapToRgb / Android GalleryResult. */
  const val ENGINE_MAX_SIDE = 1280

  fun bitmapFromUri(context: Context, uriString: String): Bitmap? {
    val stream: InputStream = openStream(context, uriString) ?: return null
    stream.use { input ->
      val bytes = input.readBytes()
      val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
      return applyExifOrientation(bytes, bitmap)
    }
  }

  /**
   * Downscale so face boxes from detect/faceDetection match cropFace / templateExtraction.
   * Gallery stills must use this before both detect and crop (coords are in prepared space).
   */
  fun enginePreparedImage(src: Bitmap, maxSide: Int = ENGINE_MAX_SIDE): Bitmap {
    val w = src.width
    val h = src.height
    if (w <= 0 || h <= 0) return src
    val longSide = maxOf(w, h)
    if (longSide <= maxSide) return src
    val scale = maxSide.toFloat() / longSide
    val tw = maxOf(1, (w * scale).toInt())
    val th = maxOf(1, (h * scale).toInt())
    return Bitmap.createScaledBitmap(src, tw, th, true)
  }

  /** file://, content://, absolute paths, and Capacitor/Cordova web paths. */
  private fun openStream(context: Context, uriString: String): InputStream? {
    val raw = uriString.trim()
    if (raw.isEmpty()) return null
    val capacitorIdx = raw.indexOf("/_capacitor_file_/")
    if (capacitorIdx >= 0) {
      val path = Uri.decode(raw.substring(capacitorIdx + "/_capacitor_file_".length))
      return try {
        java.io.FileInputStream(path)
      } catch (_: Exception) {
        null
      }
    }
    val appFileIdx = raw.indexOf("/_app_file_/")
    if (appFileIdx >= 0) {
      val path = Uri.decode(raw.substring(appFileIdx + "/_app_file_".length))
      return try {
        java.io.FileInputStream(path)
      } catch (_: Exception) {
        null
      }
    }
    return try {
      when {
        raw.startsWith("content:", ignoreCase = true) ||
          raw.startsWith("file:", ignoreCase = true) ||
          raw.startsWith("android.resource:", ignoreCase = true) -> {
          context.contentResolver.openInputStream(Uri.parse(raw))
        }
        raw.startsWith("/") -> java.io.FileInputStream(raw)
        else -> context.contentResolver.openInputStream(Uri.parse(raw))
          ?: try {
            java.io.FileInputStream(raw)
          } catch (_: Exception) {
            null
          }
      }
    } catch (_: Exception) {
      null
    }
  }

  fun bitmapFromBase64(base64: String): Bitmap? {
    val cleaned = base64.substringAfter("base64,", base64)
    val bytes = Base64.decode(cleaned, Base64.DEFAULT)
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
  }

  fun bitmapFromImageProxy(image: ImageProxy): Bitmap? {
    val rgba = imageToRgbaBitmap(image)
    if (rgba != null) {
      return rotate(rgba, image.imageInfo.rotationDegrees)
    }
    val jpeg = imageToJpegBytes(image) ?: return null
    val bitmap = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size) ?: return null
    return rotate(bitmap, image.imageInfo.rotationDegrees)
  }

  fun rotate(src: Bitmap, degrees: Int): Bitmap {
    val deg = ((degrees % 360) + 360) % 360
    if (deg == 0) return src
    val matrix = Matrix().apply { postRotate(deg.toFloat()) }
    val rotated = Bitmap.createBitmap(src, 0, 0, src.width, src.height, matrix, true)
    if (rotated !== src) src.recycle()
    return rotated
  }

  private fun imageToRgbaBitmap(image: ImageProxy): Bitmap? {
    if (image.format != ImageFormat.FLEX_RGBA_8888 && image.planes.size != 1) {
      return null
    }
    val plane = image.planes.firstOrNull() ?: return null
    val buffer = plane.buffer
    val pixelStride = plane.pixelStride
    val rowStride = plane.rowStride
    if (pixelStride <= 0) return null
    val rowPadding = rowStride - pixelStride * image.width
    buffer.rewind()
    val bitmap = Bitmap.createBitmap(
      image.width + if (pixelStride > 0) rowPadding / pixelStride else 0,
      image.height,
      Bitmap.Config.ARGB_8888
    )
    bitmap.copyPixelsFromBuffer(buffer)
    return if (rowPadding == 0) {
      bitmap
    } else {
      val cropped = Bitmap.createBitmap(bitmap, 0, 0, image.width, image.height)
      if (cropped !== bitmap) bitmap.recycle()
      cropped
    }
  }

  private fun imageToJpegBytes(image: ImageProxy): ByteArray? {
    return try {
      val yBuffer = image.planes[0].buffer
      val uBuffer = image.planes[1].buffer
      val vBuffer = image.planes[2].buffer
      val ySize = yBuffer.remaining()
      val uSize = uBuffer.remaining()
      val vSize = vBuffer.remaining()
      val nv21 = ByteArray(ySize + uSize + vSize)
      yBuffer.get(nv21, 0, ySize)
      vBuffer.get(nv21, ySize, vSize)
      uBuffer.get(nv21, ySize + vSize, uSize)
      val yuv = YuvImage(nv21, ImageFormat.NV21, image.width, image.height, null)
      val out = ByteArrayOutputStream()
      yuv.compressToJpeg(Rect(0, 0, image.width, image.height), 80, out)
      out.toByteArray()
    } catch (_: Exception) {
      null
    }
  }

  private fun applyExifOrientation(jpegBytes: ByteArray, bitmap: Bitmap): Bitmap {
    return try {
      val exif = ExifInterface(ByteArrayInputStream(jpegBytes))
      val orientation = exif.getAttributeInt(
        ExifInterface.TAG_ORIENTATION,
        ExifInterface.ORIENTATION_NORMAL
      )
      val degrees = when (orientation) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90f
        ExifInterface.ORIENTATION_ROTATE_180 -> 180f
        ExifInterface.ORIENTATION_ROTATE_270 -> 270f
        else -> 0f
      }
      if (degrees == 0f) {
        bitmap
      } else {
        val matrix = Matrix().apply { postRotate(degrees) }
        Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
      }
    } catch (_: Exception) {
      bitmap
    }
  }
}
