import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { format } from 'date-fns'

interface Session {
  id: string
  userAgent: string | null
  ipAddress: string | null
  createdAt: string
  expiresAt: string
  isCurrent: boolean
}

export default function SessionsPanel() {
  const qc = useQueryClient()

  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ['sessions'],
    queryFn: () => api.get('/auth/sessions').then(r => r.data),
  })

  const logout = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-xl font-semibold mb-4">Active Sessions</h1>
      <div className="space-y-3">
        {sessions.map(s => (
          <div key={s.id} className={`bg-gray-800 rounded-lg p-4 ${s.isCurrent ? 'border border-blue-600' : ''}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">{s.userAgent || 'Unknown browser'}</p>
                <p className="text-xs text-gray-400">{s.ipAddress || 'Unknown IP'}</p>
                <p className="text-xs text-gray-500 mt-1">Started {format(new Date(s.createdAt), 'MMM d, yyyy HH:mm')}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {s.isCurrent && <span className="text-xs text-blue-400">Current session</span>}
                <button
                  onClick={() => logout.mutate(s.id)}
                  className="text-xs text-red-400 hover:underline"
                >
                  Log out
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
