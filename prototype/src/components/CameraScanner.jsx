import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import Quagga from '@ericblade/quagga2'

const READER_ID = 'llm-camera-reader'

const QUAGGA_READERS = [
  'code_128_reader',
  'code_39_reader',
  'code_93_reader',
  'ean_reader',
  'ean_8_reader',
  'upc_reader',
  'upc_e_reader',
  'i2of5_reader',
  '2of5_reader',
]

const HTML5_FORMATS = [
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

const NATIVE_FORMATS = [
  'code_128',
  'code_39',
  'code_93',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'itf',
  'qr_code',
]

const nativeSupported = () =>
  typeof window !== 'undefined' && 'BarcodeDetector' in window

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
  const [engine, setEngine] = useState('')
  const callbacks = useRef({ onScan, onClose })
  callbacks.current = { onScan, onClose }

  useEffect(() => {
    let cleanup = () => {}
    let cancelled = false

    const finish = (code) => {
      if (cancelled) return
      cancelled = true
      callbacks.current.onScan(code)
      callbacks.current.onClose()
    }

    const stopStream = (stream) => {
      stream?.getTracks().forEach((t) => t.stop())
    }

    const startNative = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      if (cancelled) {
        stopStream(stream)
        throw new Error('cancelled')
      }
      const video = document.createElement('video')
      video.setAttribute('playsinline', '')
      video.autoplay = true
      video.muted = true
      video.srcObject = stream
      const holder = document.getElementById(READER_ID)
      if (!holder) {
        stopStream(stream)
        throw new Error('no holder')
      }
      holder.appendChild(video)
      video.style.width = '100%'
      video.style.height = '100%'
      video.style.objectFit = 'cover'
      await video.play()
      const detector = new BarcodeDetector({ formats: NATIVE_FORMATS })
      const tick = async () => {
        if (cancelled) return
        try {
          const codes = await detector.detect(video)
          if (codes.length && codes[0].rawValue) {
            finish(codes[0].rawValue)
            return
          }
        } catch {
          // frame error, keep trying
        }
        requestAnimationFrame(tick)
      }
      tick()
      cleanup = () => {
        stopStream(stream)
        video.remove()
      }
      setEngine('native')
    }

    const startQuagga = () =>
      new Promise((resolve, reject) => {
        Quagga.init(
          {
            inputStream: {
              name: 'Live',
              type: 'LiveStream',
              target: document.getElementById(READER_ID),
              constraints: { facingMode: 'environment' },
            },
            locator: { patchSize: 'medium', halfSample: true },
            numOfWorkers: 0,
            frequency: 15,
            decoder: { readers: QUAGGA_READERS },
            locate: true,
          },
          (err) => {
            if (err) {
              reject(err)
              return
            }
            Quagga.start()
            resolve()
          }
        )
        Quagga.onDetected((result) => {
          const code = result?.codeResult?.code
          if (code) finish(code)
        })
        cleanup = () => {
          try {
            Quagga.stop()
          } catch {
            // not started
          }
        }
        setEngine('quagga')
      })

    const startHtml5 = async () => {
      const scanner = new Html5Qrcode(READER_ID, { verbose: false })
      const cameraId = await pickCameraId()
      const config = {
        fps: 15,
        qrbox: (viewfinderWidth, viewfinderHeight) => ({
          width: Math.min(420, viewfinderWidth - 16),
          height: Math.min(140, viewfinderHeight - 16),
        }),
        formatsToSupport: HTML5_FORMATS,
      }
      await scanner.start(
        cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'environment' },
        config,
        (decodedText) => finish(decodedText),
        () => {}
      )
      cleanup = () => {
        scanner.stop().catch(() => {})
      }
      setEngine('html5')
    }

    const boot = async () => {
      if (nativeSupported()) {
        try {
          await startNative()
          return
        } catch {
          // fall through
        }
      }
      try {
        await startQuagga()
        return
      } catch {
        // fall through
      }
      await startHtml5()
    }

    boot()
      .then(() => {
        if (!cancelled) setStarting(false)
      })
      .catch(() => {
        if (!cancelled) {
          cancelled = true
          setStarting(false)
          setError('Could not start the camera. Check that this device has a camera and that you allowed camera access.')
        }
      })

    return () => {
      cancelled = true
      cleanup()
    }
  }, [])

  return (
    <div className="q-fade fixed inset-0 bg-slate-900/40 z-40 flex items-center justify-center p-4">
      <div className="q-pop bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div>
            <div className="font-semibold text-slate-900">Scan tag with camera</div>
            <div className="text-xs text-slate-500">
              Hold the barcode flat and level, filling the box. Steady for a second — it reads automatically.
            </div>
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
              <div id={READER_ID} className="overflow-hidden rounded-lg bg-slate-950 h-72 relative" />
              {starting && <p className="text-xs text-slate-400 mt-2 text-center">Starting camera…</p>}
              {!starting && (
                <p className="text-xs text-slate-400 mt-2 text-center">
                  {engine === 'native' && 'Native scanner active — hold the tag in view'}
                  {engine === 'quagga' && '1D scanner active — hold the tag in view'}
                  {engine === 'html5' && 'Scanner active — hold the tag in view'}
                </p>
              )}
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