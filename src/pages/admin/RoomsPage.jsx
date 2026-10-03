import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Field'
import { ErrorState, PageLoader } from '@/components/ui/PageLoader'
import { useRooms, useSaveRoom } from '@/features/admin/agendaApi'

const input =
  'w-full rounded-sm border border-carbon-500 bg-carbon-850 px-3 py-2 text-sm text-concrete-50 focus:border-monitor focus:outline-none'

const URL_PATTERN = /^https:\/\/(discord\.com|discordapp\.com)\/channels\//

function RoomRow({ room }) {
  const save = useSaveRoom()
  const [form, setForm] = useState({
    name: room?.name ?? '',
    channel_url: room?.channel_url ?? '',
    sort: room?.sort ?? 0,
    is_active: room?.is_active ?? true,
  })
  const [saved, setSaved] = useState(false)
  const urlInvalid = form.channel_url && !URL_PATTERN.test(form.channel_url)
  const dirty =
    !room ||
    form.name !== room.name ||
    (form.channel_url || null) !== room.channel_url ||
    Number(form.sort) !== room.sort ||
    form.is_active !== room.is_active

  const submit = (e) => {
    e.preventDefault()
    setSaved(false)
    save.mutate(
      { id: room?.id, name: form.name.trim(), channel_url: form.channel_url.trim() || null, sort: Number(form.sort) || 0, is_active: form.is_active },
      {
        onSuccess: () => {
          if (room) setSaved(true)
          else setForm({ name: '', channel_url: '', sort: 0, is_active: true })
        },
      },
    )
  }

  return (
    <form onSubmit={submit} className="grid items-start gap-3 rounded-sm bg-carbon-800 p-4 md:grid-cols-[160px_minmax(0,1fr)_80px_auto_auto]">
      <label className="flex flex-col gap-1">
        <span className="label">Nombre</span>
        <input className={input} value={form.name} required maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Enlace del canal de voz</span>
        <input
          className={input}
          value={form.channel_url}
          placeholder="https://discord.com/channels/SERVIDOR/CANAL"
          aria-invalid={urlInvalid || undefined}
          onChange={(e) => setForm({ ...form, channel_url: e.target.value })}
        />
        {urlInvalid && <span className="text-xs text-signal-hover">Debe empezar por https://discord.com/channels/</span>}
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Orden</span>
        <input className={input} type="number" value={form.sort} onChange={(e) => setForm({ ...form, sort: e.target.value })} />
      </label>
      <label className="flex items-center gap-2 self-center text-sm text-concrete-300 md:mt-5">
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="accent-signal" />
        Activa
      </label>
      <div className="flex flex-col gap-1 md:mt-5">
        <Button type="submit" size="sm" disabled={!dirty || urlInvalid || save.isPending}>
          {room ? 'Guardar' : 'Añadir sala'}
        </Button>
        {saved && !dirty && <span className="text-xs text-valve">Guardado</span>}
      </div>
      {save.isError && (
        <div className="md:col-span-5">
          <Alert>{save.error?.code === '23505' ? 'Ya hay una sala con ese nombre.' : 'No se ha podido guardar.'}</Alert>
        </div>
      )}
    </form>
  )
}

export function RoomsPage() {
  const { data, isPending, isError, refetch } = useRooms()
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-extrabold uppercase">Salas de Discord</h1>
        <p className="text-sm text-concrete-400">
          Cada cita ocupa una sala. El número de salas activas limita cuántas entregas puede haber a la misma hora.
          Para copiar el enlace: clic derecho en el canal de voz → Copiar enlace.
        </p>
      </header>
      {isPending ? (
        <PageLoader />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((room) => <RoomRow key={room.id} room={room} />)}
          <h2 className="label mt-4">Nueva sala</h2>
          <RoomRow room={null} />
        </div>
      )}
    </div>
  )
}
