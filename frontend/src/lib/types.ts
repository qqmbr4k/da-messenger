export interface Attachment {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  comment: string
}

export interface Message {
  id: string
  seq: number | null
  content: string
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
  replyToId: string | null
  author: { id: string; username: string }
  replyTo: { id: string; content: string; deletedAt: string | null; author: { id: string; username: string } } | null
  attachments: Attachment[]
}
