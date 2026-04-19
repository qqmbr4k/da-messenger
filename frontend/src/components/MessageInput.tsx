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
    <div className="px-4 pb-4 pt-0 shrink-0 relative" onClick={() => setShowEmoji(false)}>
      <div
        className="bg-[#383a40] rounded-lg overflow-hidden focus-within:bg-[#40434a] transition-colors"
        onClick={e => e.stopPropagation()}
      >
        {/* File previews */}
        {files.length > 0 && (
          <div className="flex gap-2 px-3 pt-3 pb-1 flex-wrap border-b border-[#1e1f22]/40">
            {files.map((f, i) => (
              <div key={i} className="bg-[#2b2d31] rounded-lg px-2.5 py-1.5 text-xs flex items-center gap-1.5 max-w-[180px]">
                <svg className="w-3.5 h-3.5 text-[#5865f2] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
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
            {/* Attach file */}
            <ToolbarButton onClick={() => fileRef.current?.click()} title="Attach file">
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </ToolbarButton>
            <input ref={fileRef} type="file" multiple className="hidden"
              onChange={e => {
                if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)])
                if (fileRef.current) fileRef.current.value = ''
              }}
            />

            {/* Emoji */}
            <div className="relative">
              <ToolbarButton onClick={e => { e.stopPropagation(); setShowEmoji(v => !v) }} title="Emoji">
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </ToolbarButton>
              {showEmoji && (
                <div className="absolute bottom-10 left-0 z-50" onClick={e => e.stopPropagation()}>
                  <EmojiPicker onEmojiClick={handleEmojiClick} theme={'dark' as any} />
                </div>
              )}
            </div>

            <div className="w-px h-4 bg-[#4a4d55] mx-1" />

            {/* Formatting buttons */}
            <ToolbarButton onClick={() => wrapSelection('**')} title="Bold (Ctrl+B)">
              <strong className="text-[13px] font-bold">B</strong>
            </ToolbarButton>
            <ToolbarButton onClick={() => wrapSelection('_')} title="Italic (Ctrl+I)">
              <em className="text-[13px] font-serif">I</em>
            </ToolbarButton>
            <ToolbarButton onClick={() => wrapSelection('~~')} title="Strikethrough">
              <s className="text-[13px]">S</s>
            </ToolbarButton>
            <ToolbarButton onClick={() => wrapSelection('`')} title="Inline code">
              <span className="font-mono text-[12px]">{`<>`}</span>
            </ToolbarButton>
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            title="Send message (Enter)"
            className={`w-8 h-8 flex items-center justify-center rounded-md transition-all ${
              canSend
                ? 'bg-[#007a5a] hover:bg-[#148567] text-white shadow-sm'
                : 'text-[#6b6f78] cursor-not-allowed'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

function ToolbarButton({ title, onClick, children }: { title: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-8 h-7 flex items-center justify-center text-[#6b6f78] hover:text-[#dce0e8] rounded hover:bg-[#4a4d55] transition-colors"
    >
      {children}
    </button>
  )
}
