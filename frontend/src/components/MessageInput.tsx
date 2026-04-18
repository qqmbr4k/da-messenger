import { useState, useRef, useCallback, useEffect } from 'react'
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [text])

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
    textareaRef.current?.focus()
  }

  function wrapSelection(before: string, after: string = before) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = text.slice(start, end) || 'text'
    const newText = text.slice(0, start) + before + selected + after + text.slice(end)
    setText(newText)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + before.length, start + before.length + selected.length)
    }, 0)
  }

  const canSend = (text.trim().length > 0 || files.length > 0) && !sending

  return (
    <div className="px-4 pb-4 shrink-0 relative" onClick={() => setShowEmoji(false)}>
      <div
        className="bg-[#383a40] border border-[#4a4d55] rounded-xl overflow-hidden focus-within:border-[#5865f2]/50 transition-colors"
        onClick={e => e.stopPropagation()}
      >
        {/* Formatting toolbar */}
        <div className="flex items-center gap-0.5 px-2 pt-1.5 pb-0 border-b border-[#1e1f22]/50">
          <FormatButton title="Bold (Ctrl+B)" onClick={() => wrapSelection('**')}>
            <strong className="text-[13px]">B</strong>
          </FormatButton>
          <FormatButton title="Italic (Ctrl+I)" onClick={() => wrapSelection('_')}>
            <em className="text-[13px]">I</em>
          </FormatButton>
          <FormatButton title="Strikethrough" onClick={() => wrapSelection('~~')}>
            <s className="text-[13px]">S</s>
          </FormatButton>
          <div className="w-px h-4 bg-[#4a4d55] mx-1" />
          <FormatButton title="Inline code" onClick={() => wrapSelection('`')}>
            <span className="font-mono text-[12px]">{`<>`}</span>
          </FormatButton>
          <FormatButton title="Code block" onClick={() => wrapSelection('```\n', '\n```')}>
            <span className="font-mono text-[11px]">{ '{ }' }</span>
          </FormatButton>
        </div>

        {/* File previews */}
        {files.length > 0 && (
          <div className="flex gap-2 px-3 pt-2 flex-wrap">
            {files.map((f, i) => (
              <div key={i} className="bg-[#2b2d31] border border-[#3f4248] rounded-lg px-2.5 py-1.5 text-xs flex items-center gap-1.5 max-w-[180px]">
                <span className="text-[#949ba4] truncate flex-1">{f.name}</span>
                <button
                  onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                  className="text-[#6b6f78] hover:text-red-400 shrink-0 transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => { setText(e.target.value); onTyping?.() }}
          onKeyDown={e => {
            if (e.key === 'b' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); wrapSelection('**') }
            else if (e.key === 'i' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); wrapSelection('_') }
            else handleKeyDown(e)
          }}
          onPaste={handlePaste}
          placeholder="Message..."
          className="w-full bg-transparent px-4 py-3 text-[15px] text-[#dce0e8] resize-none outline-none placeholder-[#6b6f78] min-h-[44px] leading-relaxed"
          rows={1}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-2 pb-2 pt-0">
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => fileRef.current?.click()}
              title="Attach file"
              className="w-8 h-8 flex items-center justify-center text-[#949ba4] hover:text-white rounded-lg hover:bg-[#4a4d55] transition-colors text-lg"
            >
              +
            </button>
            <input ref={fileRef} type="file" multiple className="hidden"
              onChange={e => {
                if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)])
                // reset input so same file can be selected again
                if (fileRef.current) fileRef.current.value = ''
              }}
            />
            <div className="relative">
              <button
                onClick={e => { e.stopPropagation(); setShowEmoji(v => !v) }}
                title="Emoji"
                className="w-8 h-8 flex items-center justify-center text-[#949ba4] hover:text-white rounded-lg hover:bg-[#4a4d55] transition-colors"
              >
                😊
              </button>
              {showEmoji && (
                <div className="absolute bottom-10 left-0 z-50" onClick={e => e.stopPropagation()}>
                  <EmojiPicker onEmojiClick={handleEmojiClick} theme={'dark' as any} />
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleSend}
            disabled={!canSend}
            title="Send (Enter)"
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all font-bold text-sm ${
              canSend
                ? 'bg-[#5865f2] hover:bg-[#4752c4] text-white shadow-sm'
                : 'bg-[#4a4d55] text-[#6b6f78] cursor-not-allowed'
            }`}
          >
            ↑
          </button>
        </div>
      </div>
      <p className="text-[11px] text-[#4f5258] text-center mt-1.5">
        Enter to send · Shift+Enter for new line · Ctrl+B bold · Ctrl+I italic
      </p>
    </div>
  )
}

function FormatButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-7 h-6 flex items-center justify-center text-[#949ba4] hover:text-white rounded hover:bg-[#4a4d55] transition-colors"
    >
      {children}
    </button>
  )
}
