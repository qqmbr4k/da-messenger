import { useState, useRef, useCallback } from 'react'
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react'

interface Props {
  onSend: (content: string, files: File[]) => Promise<void>
  roomId: string
  onTyping?: () => void
}

export default function MessageInput({ onSend, onTyping }: Props) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [showEmoji, setShowEmoji] = useState(false)
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSend = useCallback(async () => {
    if (!text.trim() && files.length === 0) return
    setSending(true)
    try {
      await onSend(text.trim() || '📎', files)
      setText('')
      setFiles([])
    } finally {
      setSending(false)
    }
  }, [text, files, onSend])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items)
    const fileItems = items.filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean) as File[]
    if (fileItems.length > 0) setFiles(prev => [...prev, ...fileItems])
  }

  function handleEmojiClick(data: EmojiClickData) {
    setText(prev => prev + data.emoji)
    setShowEmoji(false)
  }

  return (
    <div className="bg-gray-800 border-t border-gray-700 p-3 shrink-0">
      {files.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {files.map((f, i) => (
            <div key={i} className="bg-gray-700 rounded px-2 py-1 text-xs flex items-center gap-1">
              <span>{f.name}</span>
              <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-red-400">×</button>
            </div>
          ))}
        </div>
      )}
      <div className="relative flex items-end gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="text-gray-400 hover:text-gray-200 shrink-0 pb-1"
          title="Attach file"
        >
          📎
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => {
            if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)])
          }}
        />
        <textarea
          value={text}
          onChange={e => { setText(e.target.value); onTyping?.() }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
          className="flex-1 bg-gray-700 rounded px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-blue-500 min-h-[40px] max-h-40"
          rows={1}
        />
        <button
          onClick={() => setShowEmoji(v => !v)}
          className="text-gray-400 hover:text-gray-200 shrink-0 pb-1"
        >
          😊
        </button>
        <button
          onClick={handleSend}
          disabled={sending || (!text.trim() && files.length === 0)}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-3 py-1.5 rounded text-sm font-medium shrink-0"
        >
          Send
        </button>
        {showEmoji && (
          <div className="absolute bottom-12 right-0 z-50">
            <EmojiPicker onEmojiClick={handleEmojiClick} theme={'dark' as any} />
          </div>
        )}
      </div>
    </div>
  )
}
