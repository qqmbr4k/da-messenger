import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, isToday, isYesterday } from 'date-fns'
import api from '../lib/api'

interface SearchMessage {
  id: string
  roomId: string
  authorId: string
  content: string
  seq: number | null
  createdAt: string
  authorUsername: string
  roomName: string
  roomType: string
  roomDescription: string
  snippet: string
  rank: number
}

interface SearchAttachment {
  id: string
  messageId: string
  originalName: string
  mimeType: string
  size: number
  createdAt: string
  roomId: string
  messageSeq: number | null
  authorId: string
  authorUsername: string
  roomName: string
  roomType: string
}

interface Props {
  onClose: () => void
  onNavigate: (roomId: string, seq: number | null, messageId: string) => void
}

function formatDate(iso: string) {
  const d = new Date(iso)
  if (isToday(d)) return format(d, 'h:mm a')
  if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`
  return format(d, 'MMM d, yyyy')
}

function roomLabel(r: { roomName: string; roomType: string; roomDescription: string }) {
  if (r.roomType === 'DIRECT') {
    return r.roomDescription || r.roomName
  }
  return `#${r.roomName}`
}

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return '🖼'
  if (mime.includes('pdf')) return '📕'
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('gzip')) return '📦'
  if (mime.startsWith('video/')) return '🎬'
  if (mime.startsWith('audio/')) return '🎵'
  return '📄'
}

export default function SearchModal({ onClose, onNavigate }: Props) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [tab, setTab] = useState<'messages' | 'files'>('messages')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  // Reset selection when results change
  useEffect(() => { setSelectedIdx(0) }, [debouncedQuery, tab])

  const { data, isFetching } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => api.get('/search', { params: { q: debouncedQuery, limit: 30 } }).then(r => r.data as {
      messages: SearchMessage[]
      attachments: SearchAttachment[]
    }),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  })

  const messages = data?.messages ?? []
  const attachments = data?.attachments ?? []

  const handleNavigate = useCallback((roomId: string, seq: number | null, messageId: string) => {
    onNavigate(roomId, seq, messageId)
    onClose()
  }, [onNavigate, onClose])

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      const items = tab === 'messages' ? (data?.messages ?? []) : (data?.attachments ?? [])
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx(i => Math.min(i + 1, items.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = items[selectedIdx]
        if (!item) return
        if (tab === 'messages') {
          const msg = item as SearchMessage
          handleNavigate(msg.roomId, msg.seq, msg.id)
        } else {
          const att = item as SearchAttachment
          handleNavigate(att.roomId, att.messageSeq, att.messageId)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, data, tab, selectedIdx, handleNavigate])

  // Scroll selected item into view
  useEffect(() => {
    const el = resultsRef.current?.querySelector<HTMLElement>(`[data-idx="${selectedIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/60" onClick={onClose}>
      <div
        className="bg-[#1e1f22] rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2b2d31]">
          <svg className="w-5 h-5 text-[#949ba4] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search messages and files…   in:#room  in:@user  from:@user"
            className="flex-1 bg-transparent text-white placeholder-[#4f5258] text-[15px] outline-none"
          />
          {isFetching && (
            <div className="w-4 h-4 border-2 border-[#5865f2] border-t-transparent rounded-full animate-spin shrink-0" />
          )}
          <button onClick={onClose} className="text-[#6b6f78] hover:text-white transition-colors text-xl leading-none shrink-0">
            ✕
          </button>
        </div>

        {/* Tabs */}
        {debouncedQuery.length >= 2 && (
          <div className="flex border-b border-[#2b2d31] px-4">
            <TabBtn active={tab === 'messages'} onClick={() => setTab('messages')}>
              Messages {messages.length > 0 && <span className="ml-1 text-[11px] bg-[#5865f2] text-white rounded-full px-1.5">{messages.length}</span>}
            </TabBtn>
            <TabBtn active={tab === 'files'} onClick={() => setTab('files')}>
              Files {attachments.length > 0 && <span className="ml-1 text-[11px] bg-[#5865f2] text-white rounded-full px-1.5">{attachments.length}</span>}
            </TabBtn>
          </div>
        )}

        {/* Results */}
        <div ref={resultsRef} className="max-h-[60vh] overflow-y-auto">
          {debouncedQuery.length < 2 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-[#949ba4] text-sm">Type at least 2 characters to search</p>
              <div className="mt-4 text-left space-y-1.5 text-xs text-[#4f5258] max-w-xs mx-auto">
                <p><code className="text-[#949ba4]">in:#general</code> — search in a specific room</p>
                <p><code className="text-[#949ba4]">in:@alice</code> — search in DM with @alice</p>
                <p><code className="text-[#949ba4]">from:@bob</code> — messages from @bob</p>
              </div>
            </div>
          ) : tab === 'messages' ? (
            messages.length === 0 ? (
              <div className="px-6 py-8 text-center text-[#6b6f78] text-sm">
                {isFetching ? 'Searching…' : 'No messages found'}
              </div>
            ) : (
              <div className="py-2">
                {messages.map((msg, idx) => (
                  <button
                    key={msg.id}
                    data-idx={idx}
                    onClick={() => handleNavigate(msg.roomId, msg.seq, msg.id)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    className={`w-full text-left px-4 py-3 transition-colors group ${idx === selectedIdx ? 'bg-[#2b2d31]' : 'hover:bg-[#2b2d31]'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-[#5865f2] font-semibold">
                        {roomLabel(msg)}
                      </span>
                      <span className="text-[#3f4248] text-xs">·</span>
                      <span className="text-xs text-[#6b6f78] font-medium">{msg.authorUsername}</span>
                      <span className="text-[#3f4248] text-xs">·</span>
                      <span className="text-xs text-[#4f5258]">{formatDate(msg.createdAt)}</span>
                    </div>
                    <SnippetText text={msg.snippet} />
                  </button>
                ))}
              </div>
            )
          ) : (
            attachments.length === 0 ? (
              <div className="px-6 py-8 text-center text-[#6b6f78] text-sm">
                {isFetching ? 'Searching…' : 'No files found'}
              </div>
            ) : (
              <div className="py-2">
                {attachments.map((att, idx) => (
                  <button
                    key={att.id}
                    data-idx={idx}
                    onClick={() => handleNavigate(att.roomId, att.messageSeq, att.messageId)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    className={`w-full text-left px-4 py-3 transition-colors flex items-center gap-3 ${idx === selectedIdx ? 'bg-[#2b2d31]' : 'hover:bg-[#2b2d31]'}`}
                  >
                    <div className="text-2xl shrink-0">{fileIcon(att.mimeType)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#dbdee1] text-sm font-medium truncate">{att.originalName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-[#5865f2] font-semibold">
                          {att.roomType === 'DIRECT' ? att.authorUsername : `#${att.roomName}`}
                        </span>
                        <span className="text-[#3f4248] text-xs">·</span>
                        <span className="text-xs text-[#6b6f78]">{att.authorUsername}</span>
                        <span className="text-[#3f4248] text-xs">·</span>
                        <span className="text-xs text-[#4f5258]">{formatDate(att.createdAt)}</span>
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-[#4f5258] group-hover:text-[#949ba4] shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-[#2b2d31] flex items-center gap-4 text-[11px] text-[#4f5258]">
          <span><kbd className="bg-[#2b2d31] text-[#6b6f78] rounded px-1 py-0.5">↑↓</kbd> navigate</span>
          <span><kbd className="bg-[#2b2d31] text-[#6b6f78] rounded px-1 py-0.5">↵</kbd> jump to message</span>
          <span><kbd className="bg-[#2b2d31] text-[#6b6f78] rounded px-1 py-0.5">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}

// Safely parse ts_headline output — only <b>...</b> tags are expected, all other content is text
function SnippetText({ text }: { text: string }) {
  const parts: { bold: boolean; text: string }[] = []
  const re = /<b>(.*?)<\/b>/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ bold: false, text: text.slice(last, m.index) })
    parts.push({ bold: true, text: m[1] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ bold: false, text: text.slice(last) })
  return (
    <p className="text-[#dbdee1] text-sm leading-relaxed line-clamp-3">
      {parts.map((p, i) =>
        p.bold ? <strong key={i} className="text-white font-semibold">{p.text}</strong> : <span key={i}>{p.text}</span>
      )}
    </p>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'text-white border-[#5865f2]'
          : 'text-[#949ba4] border-transparent hover:text-white hover:border-[#3f4248]'
      }`}
    >
      {children}
    </button>
  )
}
