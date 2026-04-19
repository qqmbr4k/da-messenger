import { usePresenceStore } from '../store/presence'

const colors = {
  online: 'bg-[#23a55a]',
  afk: 'bg-[#f0b232]',
  offline: 'bg-[#80848e]',
}


export default function PresenceDot({ userId, className = '', borderColor = '#2b2d31' }: { userId: string; className?: string; borderColor?: string }) {
  const status = usePresenceStore(s => s.statuses[userId] ?? 'offline')
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status]} shrink-0 ${className}`}
      style={{ border: `2px solid ${borderColor}` }}
      title={status}
    />
  )
}
