import { usePresenceStore } from '../store/presence'

const colors = {
  online: 'bg-green-500',
  afk: 'bg-yellow-500',
  offline: 'bg-gray-500',
}

export default function PresenceDot({ userId }: { userId: string }) {
  const status = usePresenceStore(s => s.statuses[userId] ?? 'offline')
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]} shrink-0`} title={status} />
}
