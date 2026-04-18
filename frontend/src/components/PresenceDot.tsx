import { usePresenceStore } from '../store/presence'

const colors = {
  online: 'bg-[#23a55a]',
  afk: 'bg-[#f0b232]',
  offline: 'bg-[#80848e]',
}


export default function PresenceDot({ userId, className = '' }: { userId: string; className?: string }) {
  const status = usePresenceStore(s => s.statuses[userId] ?? 'offline')
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status]} border-2 border-[#2b2d31] shrink-0 ${className}`}
      title={status}
    />
  )
}
