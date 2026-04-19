import { useEffect, useRef, useState, useCallback } from 'react'
import { getSocket } from '../lib/socket'
import { useCallStore } from '../store/call'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Free TURN relay — fallback for symmetric NAT / firewalled networks
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

export default function CallModal() {
  const { status, remoteUserId, remoteUsername, isVideo, incomingSignal, set, reset } = useCallStore()

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream>(new MediaStream())
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const iceCandidateBuffer = useRef<RTCIceCandidateInit[]>([])
  const remoteDescSet = useRef(false)
  // Keep a stable ref to hangUp so PC event handlers never go stale
  const hangUpRef = useRef<(notify?: boolean) => void>(() => {})

  const [micMuted, setMicMuted] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [callError, setCallError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const socket = getSocket()

  // ── cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    pcRef.current?.close()
    pcRef.current = null
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    // Replace the remote stream (don't reuse the old one)
    remoteStreamRef.current = new MediaStream()
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    remoteDescSet.current = false
    iceCandidateBuffer.current = []
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); errorTimerRef.current = null }
    setElapsed(0)
    setMicMuted(false)
    setCamOff(false)
    setCallError(null)
  }, [])

  const hangUp = useCallback((notify = true) => {
    if (notify && remoteUserId) socket.emit('call_end', { to: remoteUserId })
    cleanup()
    reset()
  }, [remoteUserId, cleanup, reset, socket])

  // Keep the ref in sync so PC event handlers always call the latest hangUp
  useEffect(() => { hangUpRef.current = hangUp }, [hangUp])

  // ── get local media ────────────────────────────────────────────────────────
  const getLocalStream = useCallback(async (video: boolean): Promise<MediaStream> => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video })
    localStreamRef.current = stream
    if (localVideoRef.current && video) {
      localVideoRef.current.srcObject = stream
      localVideoRef.current.play().catch(() => {})
    }
    return stream
  }, [])

  // ── attach remote stream to video element ─────────────────────────────────
  const attachRemoteStream = useCallback(() => {
    if (!remoteVideoRef.current) return
    remoteVideoRef.current.srcObject = remoteStreamRef.current
    remoteVideoRef.current.play().catch(() => {})
  }, [])

  // ── create peer connection ─────────────────────────────────────────────────
  const createPeer = useCallback((targetId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    // Suppress renegotiation — we manage offer/answer manually
    pc.onnegotiationneeded = () => {}

    pc.onicecandidate = e => {
      if (e.candidate) socket.emit('call_ice', { to: targetId, candidate: e.candidate.toJSON() })
    }

    pc.ontrack = e => {
      // Robust: add the individual track to our own MediaStream.
      // Never rely on e.streams[0] which can be undefined in some browsers/configs.
      remoteStreamRef.current.addTrack(e.track)
      attachRemoteStream()
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        set({ status: 'connected' })
        if (!timerRef.current) timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
      }
      if (pc.connectionState === 'connecting' || pc.connectionState === 'new') {
        set({ status: 'connecting' })
      }
      if (pc.connectionState === 'failed') hangUpRef.current(false)
    }

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        set({ status: 'connected' })
        if (!timerRef.current) timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
      }
      if (pc.iceConnectionState === 'checking') {
        set({ status: 'connecting' })
      }
      if (pc.iceConnectionState === 'disconnected') {
        // Give the browser 4 s to self-recover before tearing down
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            hangUpRef.current(false)
          }
        }, 4000)
      }
      if (pc.iceConnectionState === 'failed') hangUpRef.current(false)
    }

    return pc
  }, [socket, set, attachRemoteStream])

  const flushIceBuffer = useCallback(async (pc: RTCPeerConnection) => {
    remoteDescSet.current = true
    const queued = iceCandidateBuffer.current.splice(0)
    for (const c of queued) {
      await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
    }
  }, [])

  // ── initiate outgoing call ─────────────────────────────────────────────────
  const startCall = useCallback(async () => {
    if (!remoteUserId) return
    try {
      const stream = await getLocalStream(isVideo)
      const pc = createPeer(remoteUserId)
      stream.getTracks().forEach(t => pc.addTrack(t, stream))
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socket.emit('call_offer', { to: remoteUserId, signal: offer, isVideo })
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Microphone/camera access denied'
        : err instanceof DOMException && err.name === 'NotFoundError'
          ? 'No microphone/camera found'
          : 'Failed to start call'
      setCallError(msg)
      errorTimerRef.current = setTimeout(() => hangUpRef.current(true), 2000)
    }
  }, [remoteUserId, isVideo, socket, createPeer, getLocalStream])

  // ── answer incoming call ───────────────────────────────────────────────────
  const answerCall = useCallback(async () => {
    if (!remoteUserId || !incomingSignal) return
    set({ status: 'connecting' })
    try {
      const stream = await getLocalStream(isVideo)
      const pc = createPeer(remoteUserId)
      stream.getTracks().forEach(t => pc.addTrack(t, stream))
      await pc.setRemoteDescription(new RTCSessionDescription(incomingSignal))
      await flushIceBuffer(pc)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.emit('call_answer', { to: remoteUserId, signal: answer })
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Microphone/camera access denied'
        : err instanceof DOMException && err.name === 'NotFoundError'
          ? 'No microphone/camera found'
          : 'Failed to connect'
      setCallError(msg)
      errorTimerRef.current = setTimeout(() => hangUpRef.current(true), 2000)
    }
  }, [remoteUserId, incomingSignal, isVideo, socket, set, createPeer, getLocalStream, flushIceBuffer])

  // ── socket event handlers ──────────────────────────────────────────────────
  useEffect(() => {
    async function onAnswer({ signal }: { from: string; signal: RTCSessionDescriptionInit }) {
      if (!pcRef.current) return
      set({ status: 'connecting' })
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal))
      await flushIceBuffer(pcRef.current)
    }

    function onIce({ candidate }: { from: string; candidate: RTCIceCandidateInit }) {
      if (!candidate) return
      if (pcRef.current && remoteDescSet.current) {
        pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
      } else {
        iceCandidateBuffer.current.push(candidate)
      }
    }

    function onEnd() { hangUpRef.current(false) }
    function onReject() { hangUpRef.current(false) }
    function onBusy() { hangUpRef.current(false) }

    socket.on('call_answer', onAnswer)
    socket.on('call_ice', onIce)
    socket.on('call_end', onEnd)
    socket.on('call_reject', onReject)
    socket.on('call_busy', onBusy)

    return () => {
      socket.off('call_answer', onAnswer)
      socket.off('call_ice', onIce)
      socket.off('call_end', onEnd)
      socket.off('call_reject', onReject)
      socket.off('call_busy', onBusy)
    }
    // hangUp accessed via ref; set is a stable zustand action
  }, [socket, flushIceBuffer, set])

  useEffect(() => {
    if (status === 'calling') startCall()
  }, [status, startCall])

  useEffect(() => () => { cleanup() }, [cleanup])

  // ── mic / camera toggles ───────────────────────────────────────────────────
  function toggleMic() {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    setMicMuted(v => !v)
  }

  function toggleCam() {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
    setCamOff(v => !v)
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  if (status === 'idle') return null

  return (
    <div
      data-testid="call-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-2xl mx-4 bg-[#1e1f22] rounded-2xl shadow-2xl overflow-hidden">

        {/* Remote video / avatar area */}
        <div className="relative bg-[#111214] aspect-video flex items-center justify-center">
          {/* Remote video — always rendered so srcObject works for audio too */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            data-testid="remote-video"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
              status === 'connected' && isVideo ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Avatar shown when not yet connected OR in voice-only call */}
          <div className={`flex flex-col items-center gap-4 z-10 transition-opacity duration-300 ${
            status === 'connected' && isVideo ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}>
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#5865f2] to-violet-600 flex items-center justify-center text-4xl font-bold text-white shadow-xl">
              {remoteUsername?.[0]?.toUpperCase() ?? '?'}
            </div>
            <p className="text-white text-xl font-semibold">{remoteUsername}</p>
            {callError ? (
              <p className="text-red-400 text-sm font-medium">{callError}</p>
            ) : (
              <p className="text-[#949ba4] text-sm animate-pulse">
                {status === 'calling' ? 'Ringing…'
                  : status === 'receiving' ? 'Incoming call…'
                  : status === 'connecting' ? 'Connecting…'
                  : formatTime(elapsed)}
              </p>
            )}
          </div>

          {/* Local video PiP */}
          {isVideo && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              data-testid="local-video"
              className="absolute bottom-3 right-3 w-36 rounded-xl border-2 border-[#3f4248] shadow-lg object-cover aspect-video z-20"
            />
          )}

          {/* Timer badge */}
          {status === 'connected' && (
            <div
              className="absolute top-3 left-3 bg-black/50 rounded-full px-3 py-1 text-green-400 text-xs font-mono z-20"
              data-testid="call-timer"
            >
              {formatTime(elapsed)}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 px-6 py-5 bg-[#1e1f22]">
          {status === 'receiving' ? (
            <>
              <button
                data-testid="reject-call"
                onClick={() => { socket.emit('call_reject', { to: remoteUserId }); cleanup(); reset() }}
                className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg"
                title="Reject"
              >
                <PhoneOffIcon />
              </button>
              <button
                data-testid="accept-call"
                onClick={answerCall}
                className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors shadow-lg"
                title="Accept"
              >
                <PhoneIcon />
              </button>
            </>
          ) : (
            <>
              <button
                data-testid="toggle-mic"
                onClick={toggleMic}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${micMuted ? 'bg-red-500/20 text-red-400' : 'bg-[#3f4248] text-[#949ba4] hover:text-white'}`}
                title={micMuted ? 'Unmute' : 'Mute'}
              >
                {micMuted ? <MicOffIcon /> : <MicIcon />}
              </button>

              {isVideo && (
                <button
                  data-testid="toggle-cam"
                  onClick={toggleCam}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${camOff ? 'bg-red-500/20 text-red-400' : 'bg-[#3f4248] text-[#949ba4] hover:text-white'}`}
                  title={camOff ? 'Turn camera on' : 'Turn camera off'}
                >
                  {camOff ? <CamOffIcon /> : <CamIcon />}
                </button>
              )}

              <button
                data-testid="hangup"
                onClick={() => hangUp(true)}
                className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg"
                title="Hang up"
              >
                <PhoneOffIcon />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function PhoneIcon() {
  return (
    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  )
}

function PhoneOffIcon() {
  return (
    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L7.228 3.683A1 1 0 006.279 3H5z" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  )
}

function MicOffIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
    </svg>
  )
}

function CamIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  )
}

function CamOffIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 3l18 18M5 18h8a2 2 0 002-2v-.172M7.757 7.757A2 2 0 005 10v6" />
    </svg>
  )
}
