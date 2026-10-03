import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Field'
import { ErrorState, PageLoader } from '@/components/ui/PageLoader'
import { useAgendaTable, useExceptions, useRules, useStaff } from '@/features/admin/agendaApi'
import { usePublicSettings } from '@/features/settings/useSettings'

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const ORDER = [1, 2, 3, 4, 5, 6, 0] // la semana empieza en lunes
const TIMEZONES = ['America/Lima', 'America/Bogota', 'America/Mexico_City', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/New_York', 'Europe/Madrid', 'UTC']

const input =
  'rounded-sm border border-carbon-500 bg-carbon-850 px-3 py-2 text-sm text-concrete-50 focus:border-monitor focus:outline-none'

function RuleForm({ staff, defaultTz }) {
  const table = useAgendaTable('ARC_availability_rules', 'rules')
  const [form, setForm] = useState({ admin_id: staff[0]?.id ?? '', days: [1, 2, 3, 4, 5], start: '18:00', end: '23:00', timezone: defaultTz })

  const toggleDay = (d) =>
    setForm((f) => ({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] }))

  const submit = (e) => {
    e.preventDefault()
    table.mutate({
      op: 'insert',
      values: form.days.map((weekday) => ({
        admin_id: form.admin_id, weekday, start_time: form.start, end_time: form.end, timezone: form.timezone,
      })),
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-sm bg-carbon-800 p-4">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="label">Admin</span>
          <select className={input} value={form.admin_id} onChange={(e) => setForm({ ...form, admin_id: e.target.value })} required>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.discord_username || s.username}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Desde</span>
          <input type="time" className={input} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Hasta</span>
          <input type="time" className={input} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Zona horaria</span>
          <select className={input} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </label>
      </div>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="label mb-2">Días</legend>
        {ORDER.map((d) => (
          <label key={d} className={`cursor-pointer rounded-sm border px-3 py-1.5 text-sm ${form.days.includes(d) ? 'border-signal bg-signal/10 text-concrete-50' : 'border-carbon-500 text-concrete-400'}`}>
            <input type="checkbox" className="sr-only" checked={form.days.includes(d)} onChange={() => toggleDay(d)} />
            {WEEKDAYS[d]}
          </label>
        ))}
      </fieldset>
      {form.end <= form.start && <Alert>La hora de fin tiene que ser posterior a la de inicio.</Alert>}
      {table.isError && <Alert>No se ha podido guardar el horario.</Alert>}
      <Button type="submit" size="sm" className="self-start" disabled={!form.days.length || form.end <= form.start || table.isPending}>
        Añadir horario
      </Button>
    </form>
  )
}

function ExceptionForm({ staff }) {
  const table = useAgendaTable('ARC_availability_exceptions', 'exceptions')
  const [form, setForm] = useState({ admin_id: '', starts_at: '', ends_at: '', reason: '' })
  const invalid = form.starts_at && form.ends_at && form.ends_at <= form.starts_at

  const submit = (e) => {
    e.preventDefault()
    table.mutate(
      {
        op: 'insert',
        values: {
          admin_id: form.admin_id || null,
          // datetime-local está en la hora de este navegador: se convierte a UTC
          starts_at: new Date(form.starts_at).toISOString(),
          ends_at: new Date(form.ends_at).toISOString(),
          reason: form.reason.trim() || null,
        },
      },
      { onSuccess: () => setForm({ admin_id: '', starts_at: '', ends_at: '', reason: '' }) },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-sm bg-carbon-800 p-4">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="label">Afecta a</span>
          <select className={input} value={form.admin_id} onChange={(e) => setForm({ ...form, admin_id: e.target.value })}>
            <option value="">Todo el staff</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.discord_username || s.username}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Desde</span>
          <input type="datetime-local" className={input} value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Hasta</span>
          <input type="datetime-local" className={input} value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} required />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          <span className="label">Motivo</span>
          <input className={input} value={form.reason} maxLength={200} placeholder="Vacaciones, mantenimiento del juego…" onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </label>
      </div>
      {invalid && <Alert>El fin tiene que ser posterior al inicio.</Alert>}
      {table.isError && <Alert>No se ha podido guardar el bloqueo.</Alert>}
      <Button type="submit" size="sm" className="self-start" disabled={invalid || table.isPending}>Bloquear fechas</Button>
    </form>
  )
}

export function AvailabilityPage() {
  const staff = useStaff()
  const rules = useRules()
  const exceptions = useExceptions()
  const { data: settings } = usePublicSettings()
  const rulesTable = useAgendaTable('ARC_availability_rules', 'rules')
  const exceptionsTable = useAgendaTable('ARC_availability_exceptions', 'exceptions')

  if (staff.isPending || rules.isPending || exceptions.isPending) return <PageLoader />
  if (staff.isError || rules.isError || exceptions.isError) {
    return <ErrorState onRetry={() => { staff.refetch(); rules.refetch(); exceptions.refetch() }} />
  }

  const byDay = ORDER.map((d) => ({ day: d, items: rules.data.filter((r) => r.weekday === d) }))

  return (
    <div className="flex max-w-5xl flex-col gap-10">
      <section className="flex flex-col gap-4">
        <header>
          <h1 className="font-display text-4xl font-extrabold uppercase">Disponibilidad</h1>
          <p className="text-sm text-concrete-400">
            Horario semanal de cada admin. Los huecos de {settings?.slot_minutes ?? 30} minutos se generan solos y
            se ofrecen desde {settings?.min_notice_hours ?? 2} h hasta {settings?.max_days_ahead ?? 14} días antes.
          </p>
        </header>

        <div className="grid gap-2">
          {byDay.map(({ day, items }) => (
            <div key={day} className="grid gap-2 rounded-sm bg-carbon-800 p-3 sm:grid-cols-[120px_minmax(0,1fr)]">
              <span className="font-display text-lg font-semibold uppercase">{WEEKDAYS[day]}</span>
              {items.length === 0 ? (
                <span className="text-sm text-concrete-500">Sin horario</span>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {items.map((r) => (
                    <li key={r.id} className={`flex items-center gap-2 rounded-sm border px-2.5 py-1 text-sm ${r.is_active ? 'border-carbon-500' : 'border-dashed border-carbon-600 opacity-60'}`}>
                      <span className="font-mono">{r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}</span>
                      <span className="text-concrete-400">{r.admin?.username} · {r.timezone}</span>
                      <button
                        type="button"
                        className="label hover:text-concrete-50"
                        onClick={() => rulesTable.mutate({ op: 'update', id: r.id, values: { is_active: !r.is_active } })}
                      >
                        {r.is_active ? 'Pausar' : 'Activar'}
                      </button>
                      <button
                        type="button"
                        className="label hover:text-signal-hover"
                        aria-label={`Borrar horario de ${WEEKDAYS[day]} ${r.start_time.slice(0, 5)}`}
                        onClick={() => rulesTable.mutate({ op: 'delete', id: r.id })}
                      >
                        Borrar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        <h2 className="label mt-2">Añadir horario</h2>
        {staff.data.length ? (
          <RuleForm staff={staff.data} defaultTz={settings?.store_timezone || 'America/Lima'} />
        ) : (
          <p className="text-sm text-concrete-400">No hay admins. Da el rol admin a alguien desde la base de datos.</p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <header>
          <h2 className="font-display text-3xl font-extrabold uppercase">Días bloqueados</h2>
          <p className="text-sm text-concrete-400">En estos intervalos no se ofrecen huecos (las citas ya reservadas se mantienen).</p>
        </header>
        {exceptions.data.length > 0 && (
          <ul className="flex flex-col gap-2">
            {exceptions.data.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 rounded-sm bg-carbon-800 px-4 py-3 text-sm">
                <span className="font-mono">
                  {new Date(x.starts_at).toLocaleString('es')} → {new Date(x.ends_at).toLocaleString('es')}
                </span>
                <span className="text-concrete-400">{x.admin?.username ?? 'Todo el staff'}{x.reason ? ` · ${x.reason}` : ''}</span>
                <button type="button" className="label ml-auto hover:text-signal-hover" onClick={() => exceptionsTable.mutate({ op: 'delete', id: x.id })}>
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
        <ExceptionForm staff={staff.data} />
      </section>
    </div>
  )
}
