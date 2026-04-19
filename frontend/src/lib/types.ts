export interface Attachment {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  comment: string
}

export interface Reaction {
  id: string
  emoji: string
  userId: string
  user: { username: string }
}

export interface Message {
  id: string
  seq: number | null
  content: string
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
  replyToId: string | null
  forwardedFromId: string | null
  author: { id: string; username: string }
  replyTo: { id: string; content: string; deletedAt: string | null; author: { id: string; username: string } } | null
  forwardedFrom: { id: string; content: string; author: { id: string; username: string } } | null
  attachments: Attachment[]
  reactions: Reaction[]
}
