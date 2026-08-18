import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

const READER_ID = 'llm-camera-reader'

const FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
]

const pickCameraId = async () => {
  if (!navigator.mediaDevices?.enumerateDevices) return null
  const devices = await navigator.mediaDevices.enumerateDevices()
  const videos = devices.filter((d) => d.kind === 'videoinput' && d.deviceId)
  if (!videos.length) return null
  const rear = videos.find((d) => /back|rear|environment/i.test(d.label))
  return rear?.deviceId ?? videos[0].deviceId
}

export default function CameraScanner({ onScan, onClose }) {
  const [error, setError] = useState(null)
  const [starting, setStarting] = useState(true)
  const callbacks = useRef({ onScan, onClose })
  callbacks.current = { onScan, onClose }

  useEffect(() => {
    const scanner = new Html5Qrcode(READER_ID, { verbose: false })
    let done = false

    const stop = () => {
      try {
        scanner.stop().catch(() => {})
      } catch {
        // scanner is not running or paused; nothing to stop
      }
    }

    const finish = (code) => {
      if (done) return
      done = true
      stop()
      callbacks.current.onScan(code)
      callbacks.current.onClose()
    }

    const startScanning = async () => {
      const cameraId = await pickCameraId()
      const config = {
        fps: 10,
        qrbox: (viewfinderWidth, viewfinderHeight) => ({
          width: Math.min(260, viewfinderWidth - 24),
          height: Math.min(180, viewfinderHeight - 24),
        }),
        formatsToSupport: FORMATS,
      }
      await scanner.start(
        cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'environment' },
        config,
        (decodedText) => finish(decodedText),
        () => {}
      )
    }

    startScanning()
      .then(() => {
        if (!done) setStarting(false)
      })
      .catch(() => {
        if (!done) {
          done = true
          setStarting(false)
          setError('Could not start the camera. Check that this device has a camera and that you allowed camera access.')
        }
      })

    return () => {
      if (done) return
      done = true
      stop()
    }
  }, [])

  return (
    <div className="q-fade fixed inset-0 bg-slate-900/40 z-40 flex items-center justify-center p-4">
      <div className="q-pop bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div>
            <div className="font-semibold text-slate-900">Scan tag with camera</div>
            <div className="text-xs text-slate-500">Hold the barcode or QR code steady inside the frame</div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none px-2 transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-4">
          {error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>
          ) : (
            <>
              <div id={READER_ID} className="overflow-hidden rounded-lg bg-slate-950 h-72" />
              {starting && <p className="text-xs text-slate-400 mt-2 text-center">Starting camera…</p>}
            </>
          )}
        </div>
        <div className="px-4 pb-4">
          <button
            onClick={onClose}
            className="w-full py-2.5 border border-slate-300 rounded-lg font-medium text-sm hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
