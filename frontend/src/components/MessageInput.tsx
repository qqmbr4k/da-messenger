import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react'
import { searchEmojis } from '../lib/emojiData'

interface FileEntry { file: File; comment: string }
interface Member { id: string; username: string }

interface Props {
  onSend: (content: string, files: File[], comments: string[]) => Promise<void>
  roomId: string
  onTyping?: () => void
  members?: Member[]
}

export interface MessageInputHandle {
  focus: () => void
}

function getMentionRange(text: string, cursorPos: number): { start: number; query: string } | null {
  const before = text.slice(0, cursorPos)
  const match = before.match(/@(\w*)$/)
  if (!match) return null
  return { start: cursorPos - match[0].length, query: match[1] }
}

function getEmojiNameRange(text: string, cursorPos: number): { start: number; query: string } | null {
  const before = text.slice(0, cursorPos)
  const match = before.match(/:([a-z_]\w*)$/)
  if (!match || match[1].length < 2) return null
  return { start: cursorPos - match[0].length, query: match[1] }
}

const MessageInput = forwardRef<MessageInputHandle, Props>(function MessageInput(
  { onSend, onTyping, members = [] },
  ref,
) {
  const [text, setText] = useState('')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [showEmoji, setShowEmoji] = useState(false)
  const [sending, setSending] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState(0)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [emojiNameQuery, setEmojiNameQuery] = useState<string | null>(null)
  const [emojiNameStart, setEmojiNameStart] = useState(0)
  const [emojiNameIndex, setEmojiNameIndex] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }))

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [text])

  const filteredMembers = mentionQuery !== null
    ? members.filter(m => m.username.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 8)
    : []

  const emojiSuggestions = emojiNameQuery !== null ? searchEmojis(emojiNameQuery, 8) : []

  const insertMention = useCallback((username: string) => {
    const el = textareaRef.current
    if (!el) return
    const cursorPos = el.selectionStart ?? text.length
    const newText = text.slice(0, mentionStart) + `@${username} ` + text.slice(cursorPos)
    setText(newText)
    setMentionQuery(null)
    requestAnimationFrame(() => {
      el.focus()
      const pos = mentionStart + username.length + 2
      el.setSelectionRange(pos, pos)
    })
  }, [text, mentionStart])

  const insertEmojiByName = useCallback((emoji: string) => {
    const el = textareaRef.current
    if (!el) return
    const cursorPos = el.selectionStart ?? text.length
    const insertion = emoji + ' '
    const newText = text.slice(0, emojiNameStart) + insertion + text.slice(cursorPos)
    setText(newText)
    setEmojiNameQuery(null)
    requestAnimationFrame(() => {
      el.focus()
      const pos = emojiNameStart + insertion.length
      el.setSelectionRange(pos, pos)
    })
  }, [text, emojiNameStart])

  const handleSend = useCallback(async () => {
    if (!text.trim() && entries.length === 0) return
    setSending(true)
    try {
      await onSend(
        text.trim() || '📎',
        entries.map(e => e.file),
        entries.map(e => e.comment),
      )
      setText('')
      setEntries([])
    } finally {
      setSending(false)
    }
  }, [text, entries, onSend])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newText = e.target.value
    setText(newText)
    onTyping?.()
    const pos = e.target.selectionStart ?? newText.length

    const mentionRange = getMentionRange(newText, pos)
    if (mentionRange && members.length > 0) {
      setMentionQuery(mentionRange.query)
      setMentionStart(mentionRange.start)
      setMentionIndex(0)
      setEmojiNameQuery(null)
    } else {
      setMentionQuery(null)
      const emojiRange = getEmojiNameRange(newText, pos)
      if (emojiRange) {
        setEmojiNameQuery(emojiRange.query)
        setEmojiNameStart(emojiRange.start)
        setEmojiNameIndex(0)
      } else {
        setEmojiNameQuery(null)
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (mentionQuery !== null && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % filteredMembers.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + filteredMembers.length) % filteredMembers.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(filteredMembers[mentionIndex].username); return }
      if (e.key === 'Escape') { setMentionQuery(null); return }
    }

    if (emojiNameQuery !== null && emojiSuggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setEmojiNameIndex(i => (i + 1) % emojiSuggestions.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setEmojiNameIndex(i => (i - 1 + emojiSuggestions.length) % emojiSuggestions.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertEmojiByName(emojiSuggestions[emojiNameIndex].emoji); return }
      if (e.key === 'Escape') { setEmojiNameQuery(null); return }
    }

    if (e.key === 'b' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); wrapSelection('**') }
    else if (e.key === 'i' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); wrapSelection('_') }
    else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  function addFiles(newFiles: File[]) {
    setEntries(prev => [...prev, ...newFiles.map(file => ({ file, comment: '' }))])
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items)
    const fileItems = items.filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean) as File[]
    if (fileItems.length > 0) addFiles(fileItems)
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

  const canSend = (text.trim().length > 0 || entries.length > 0) && !sending

  return (
    <div
      className="px-4 pb-4 pt-0 shrink-0 relative"
      onClick={() => { setShowEmoji(false); setMentionQuery(null); setEmojiNameQuery(null) }}
    >
      {/* @mention autocomplete dropdown */}
      {mentionQuery !== null && filteredMembers.length > 0 && (
        <div
          className="absolute bottom-full mb-1 left-4 right-4 bg-[#111214] border border-[#3f4248] rounded-lg shadow-2xl overflow-hidden z-50"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[11px] text-[#6b6f78] font-semibold uppercase tracking-wide border-b border-[#1e1f22]">
            Members matching @{mentionQuery || '…'}
          </div>
          {filteredMembers.map((m, i) => (
            <button
              key={m.id}
              onMouseDown={e => { e.preventDefault(); insertMention(m.username) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                i === mentionIndex ? 'bg-[#5865f2]/20 text-white' : 'text-[#dce0e8] hover:bg-[#3f4248]'
              }`}
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#5865f2] to-violet-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                {m.username[0].toUpperCase()}
              </div>
              <span className="font-medium">@{m.username}</span>
            </button>
          ))}
        </div>
      )}

      {/* :emoji: autocomplete dropdown */}
      {emojiNameQuery !== null && emojiSuggestions.length > 0 && (
        <div
          className="absolute bottom-full mb-1 left-4 right-4 bg-[#111214] border border-[#3f4248] rounded-lg shadow-2xl overflow-hidden z-50"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[11px] text-[#6b6f78] font-semibold uppercase tracking-wide border-b border-[#1e1f22]">
            Emoji matching :{emojiNameQuery}
          </div>
          {emojiSuggestions.map((s, i) => (
            <button
              key={s.name}
              onMouseDown={e => { e.preventDefault(); insertEmojiByName(s.emoji) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                i === emojiNameIndex ? 'bg-[#5865f2]/20 text-white' : 'text-[#dce0e8] hover:bg-[#3f4248]'
              }`}
            >
              <span className="text-xl w-7 text-center shrink-0">{s.emoji}</span>
              <span className="font-medium text-[#949ba4]">:{s.name}:</span>
            </button>
          ))}
        </div>
      )}

      {/* Emoji picker — rendered outside overflow-hidden so it's never clipped */}
      {showEmoji && (
        <div
          className="absolute bottom-full mb-2 left-4 z-50"
          onClick={e => e.stopPropagation()}
        >
          <EmojiPicker onEmojiClick={handleEmojiClick} theme={'dark' as any} />
        </div>
      )}

      <div
        className="bg-[#383a40] rounded-lg overflow-hidden focus-within:bg-[#40434a] transition-colors"
        onClick={e => e.stopPropagation()}
      >
        {/* File previews */}
        {entries.length > 0 && (
          <div className="flex flex-col gap-1.5 px-3 pt-3 pb-2 border-b border-[#1e1f22]/40">
            {entries.map((entry, i) => (
              <div key={i} className="bg-[#2b2d31] rounded-lg px-2.5 py-2 text-xs flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-[#5865f2] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <span className="text-[#949ba4] truncate flex-1">{entry.file.name}</span>
                  <button
                    onClick={() => setEntries(prev => prev.filter((_, j) => j !== i))}
                    className="text-[#6b6f78] hover:text-red-400 shrink-0 transition-colors"
                  >
                    ×
                  </button>
                </div>
                <input
                  value={entry.comment}
                  onChange={e => setEntries(prev => prev.map((en, j) => j === i ? { ...en, comment: e.target.value } : en))}
                  placeholder="Add a comment (optional)"
                  className="bg-[#383a40] rounded px-2 py-1 text-[11px] text-[#dce0e8] placeholder-[#6b6f78] outline-none focus:bg-[#40434a] transition-colors"
                />
              </div>
            ))}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
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
                if (e.target.files) addFiles(Array.from(e.target.files!))
                if (fileRef.current) fileRef.current.value = ''
              }}
            />

            {/* Emoji toggle — picker is rendered outside overflow-hidden above */}
            <ToolbarButton onClick={e => { e.stopPropagation(); setShowEmoji(v => !v) }} title="Emoji">
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </ToolbarButton>

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
            <ToolbarButton onClick={() => wrapSelection('```\n', '\n```')} title="Code block">
              <span className="font-mono text-[11px]">{'{ }'}</span>
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
})

export default MessageInput

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
