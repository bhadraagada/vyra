"use client"

import { api } from "@vyra/backend/convex/_generated/api"
import type { Doc, Id } from "@vyra/backend/convex/_generated/dataModel"
import { useMutation, useQuery } from "convex/react"
import { useState } from "react"
import { at, date, duration, km, need, num, onForm, run, text, toInput } from "@/lib/ui"

export default function GaragePage() {
  const vehicles = useQuery(api.vehicles.list)
  const [selected, setSelected] = useState<Id<"vehicles"> | null>(null)
  const [editing, setEditing] = useState<Doc<"vehicles"> | "new" | null>(null)
  const setDefault = useMutation(api.vehicles.setDefault)
  const archive = useMutation(api.vehicles.archive)
  const current = vehicles?.find((v) => v._id === selected) ?? vehicles?.find((v) => v.isDefault) ?? vehicles?.[0]

  return (
    <>
      <div className="mt-4 flex items-center gap-3">
        <h1 className="m-0">Garage</h1>
        <button onClick={() => setEditing("new")}>Add vehicle</button>
      </div>
      {editing && (
        <VehicleForm
          key={editing === "new" ? "new" : editing._id}
          vehicle={editing === "new" ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}
      <table className="mt-3">
        <thead>
          <tr>
            <th>Name</th>
            <th>Start link</th>
            <th>Make and model</th>
            <th className="n">Year</th>
            <th>Registration</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {vehicles?.map((v) => (
            <tr key={v._id} className={v.archived ? "text-neutral-500" : ""}>
              <td>
                <button className={v._id === current?._id ? "border-white" : ""} onClick={() => setSelected(v._id)}>
                  {v.name}
                </button>
              </td>
              <td className="font-mono text-xs">
                <a className="u" href={`vyra://start?vehicle=${v.triggerKey}`}>{`vyra://start?vehicle=${v.triggerKey}`}</a>
              </td>
              <td>{[v.make, v.model].filter(Boolean).join(" ")}</td>
              <td className="n">{v.year ?? ""}</td>
              <td>{v.registration ?? ""}</td>
              <td>
                {v.archived ? (
                  "archived"
                ) : v.isDefault ? (
                  "default"
                ) : (
                  <button onClick={() => void run(setDefault({ vehicleId: v._id }))}>Set default</button>
                )}
              </td>
              <td className="space-x-2">
                <button onClick={() => setEditing(v)}>Edit</button>
                {!v.archived && (
                  <button onClick={() => confirm(`Archive ${v.name}?`) && void run(archive({ vehicleId: v._id }))}>
                    Archive
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {vehicles?.length === 0 && <p className="mt-3 text-sm">No vehicles. The first one you add becomes the default.</p>}
      {current && <VehicleDetail key={current._id} vehicle={current} />}
    </>
  )
}

/** Create form when `vehicle` is null, edit form otherwise. */
function VehicleForm({ vehicle, onDone }: { vehicle: Doc<"vehicles"> | null; onDone: () => void }) {
  const create = useMutation(api.vehicles.create)
  const update = useMutation(api.vehicles.update)
  const submit = onForm(async (fd) => {
    const name = text(fd, "name")
    const triggerKey = text(fd, "triggerKey")
    if (!name || !triggerKey) throw new Error("Name and trigger key are required")
    const fields = {
      name,
      triggerKey,
      make: text(fd, "make"),
      model: text(fd, "model"),
      year: num(fd, "year"),
      registration: text(fd, "registration"),
      odometerBaselineKm: num(fd, "odometerBaselineKm"),
    }
    await (vehicle ? update({ vehicleId: vehicle._id, ...fields }) : create(fields))
    onDone()
  })
  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <input name="name" placeholder="Name" required defaultValue={vehicle?.name} />
      <input name="triggerKey" placeholder="Trigger key" required pattern="[a-zA-Z0-9\-]+" defaultValue={vehicle?.triggerKey} />
      <input name="make" placeholder="Make" defaultValue={vehicle?.make} />
      <input name="model" placeholder="Model" defaultValue={vehicle?.model} />
      <input name="year" type="number" placeholder="Year" className="w-20" defaultValue={vehicle?.year} />
      <input name="registration" placeholder="Registration" defaultValue={vehicle?.registration} />
      <input
        name="odometerBaselineKm"
        type="number"
        step="any"
        placeholder="Baseline km"
        className="w-28"
        defaultValue={vehicle?.odometerBaselineKm}
      />
      <button type="submit">{vehicle ? "Save" : "Add"}</button>
      <button type="button" onClick={onDone}>
        Cancel
      </button>
    </form>
  )
}

function Remove({ onRemove }: { onRemove: () => Promise<unknown> }) {
  return <button onClick={() => confirm("Remove this entry?") && void run(onRemove())}>Remove</button>
}

const money = (n: number | undefined) => (n === undefined ? "" : n.toFixed(2))

/** Summary and the odometer, fuel and service logs of one vehicle. */
function VehicleDetail({ vehicle }: { vehicle: Doc<"vehicles"> }) {
  const vehicleId = vehicle._id
  const summary = useQuery(api.garage.vehicleSummary, { vehicleId })
  const odometer = useQuery(api.garage.listOdometer, { vehicleId })
  const fuel = useQuery(api.garage.listFuel, { vehicleId })
  const service = useQuery(api.garage.listService, { vehicleId })
  const addOdometer = useMutation(api.garage.addOdometer)
  const removeOdometer = useMutation(api.garage.removeOdometer)
  const addFuel = useMutation(api.garage.addFuel)
  const removeFuel = useMutation(api.garage.removeFuel)
  const addService = useMutation(api.garage.addService)
  const removeService = useMutation(api.garage.removeService)
  const now = toInput(Date.now())

  const summaryRows = summary && [
    ["Trips", String(summary.tripCount)],
    ["Distance", km(summary.distanceM)],
    ["Time driven", duration(summary.durationS)],
    ["Odometer", summary.latestOdometer ? `${summary.latestOdometer.km} km on ${date(summary.latestOdometer.at)}` : ""],
    ["Fuel economy", summary.avgKmPerL === null ? "Needs two full fills" : `${summary.avgKmPerL.toFixed(1)} km/L`],
  ]

  return (
    <>
      <h2>{vehicle.name}</h2>
      <table className="max-w-md">
        <tbody>
          {summaryRows?.map(([k, v]) => (
            <tr key={k}>
              <td className="text-neutral-400">{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Odometer</h2>
      <form
        className="flex flex-wrap gap-2 text-sm"
        onSubmit={onForm(async (fd) => addOdometer({ vehicleId, at: at(fd), km: need(fd, "km"), note: text(fd, "note") }))}
      >
        <input name="at" type="datetime-local" aria-label="Date" required defaultValue={now} />
        <input name="km" type="number" step="any" placeholder="km" required className="w-28" />
        <input name="note" placeholder="Note" />
        <button type="submit">Add</button>
      </form>
      <table className="mt-2">
        <thead>
          <tr>
            <th>Date</th>
            <th className="n">km</th>
            <th>Note</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {odometer?.map((e) => (
            <tr key={e._id}>
              <td>{date(e.at)}</td>
              <td className="n">{e.km}</td>
              <td>{e.note}</td>
              <td>
                <Remove onRemove={() => removeOdometer({ entryId: e._id })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Fuel</h2>
      <form
        className="flex flex-wrap items-center gap-2 text-sm"
        onSubmit={onForm(async (fd) =>
          addFuel({
            vehicleId,
            at: at(fd),
            odometerKm: need(fd, "odometerKm"),
            litres: need(fd, "litres"),
            totalCost: need(fd, "totalCost"),
            fullTank: fd.get("fullTank") === "on",
            note: text(fd, "note"),
          }),
        )}
      >
        <input name="at" type="datetime-local" aria-label="Date" required defaultValue={now} />
        <input name="odometerKm" type="number" step="any" placeholder="Odometer km" required className="w-28" />
        <input name="litres" type="number" step="any" placeholder="Litres" required className="w-20" />
        <input name="totalCost" type="number" step="any" placeholder="Total cost" required className="w-24" />
        <label className="flex items-center gap-1">
          <input name="fullTank" type="checkbox" defaultChecked /> Full tank
        </label>
        <input name="note" placeholder="Note" />
        <button type="submit">Add</button>
      </form>
      <table className="mt-2">
        <thead>
          <tr>
            <th>Date</th>
            <th className="n">Odometer km</th>
            <th className="n">Litres</th>
            <th className="n">Cost</th>
            <th>Full</th>
            <th>Note</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {fuel?.map((e) => (
            <tr key={e._id}>
              <td>{date(e.at)}</td>
              <td className="n">{e.odometerKm}</td>
              <td className="n">{e.litres.toFixed(2)}</td>
              <td className="n">{money(e.totalCost)}</td>
              <td>{e.fullTank ? "yes" : "no"}</td>
              <td>{e.note}</td>
              <td>
                <Remove onRemove={() => removeFuel({ entryId: e._id })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Fuel economy</h2>
      <table>
        <thead>
          <tr>
            <th>Fill</th>
            <th className="n">km</th>
            <th className="n">Litres</th>
            <th className="n">Cost</th>
            <th className="n">km/L</th>
            <th className="n">Cost per km</th>
          </tr>
        </thead>
        <tbody>
          {summary?.fuelSpans.map((s) => (
            <tr key={s.at}>
              <td>{date(s.at)}</td>
              <td className="n">{s.km.toFixed(0)}</td>
              <td className="n">{s.litres.toFixed(2)}</td>
              <td className="n">{money(s.cost)}</td>
              <td className="n">{s.kmPerL.toFixed(1)}</td>
              <td className="n">{s.costPerKm.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Service</h2>
      <form
        className="flex flex-wrap gap-2 text-sm"
        onSubmit={onForm(async (fd) => {
          const kind = text(fd, "kind")
          if (!kind) throw new Error("Kind is required")
          return addService({
            vehicleId,
            at: at(fd),
            kind,
            cost: num(fd, "cost"),
            odometerKm: num(fd, "odometerKm"),
            note: text(fd, "note"),
          })
        })}
      >
        <input name="at" type="datetime-local" aria-label="Date" required defaultValue={now} />
        <input name="kind" placeholder="Kind, such as oil change" required />
        <input name="cost" type="number" step="any" placeholder="Cost" className="w-24" />
        <input name="odometerKm" type="number" step="any" placeholder="Odometer km" className="w-28" />
        <input name="note" placeholder="Note" />
        <button type="submit">Add</button>
      </form>
      <table className="mt-2">
        <thead>
          <tr>
            <th>Date</th>
            <th>Kind</th>
            <th className="n">Cost</th>
            <th className="n">Odometer km</th>
            <th>Note</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {service?.map((e) => (
            <tr key={e._id}>
              <td>{date(e.at)}</td>
              <td>{e.kind}</td>
              <td className="n">{money(e.cost)}</td>
              <td className="n">{e.odometerKm ?? ""}</td>
              <td>{e.note}</td>
              <td>
                <Remove onRemove={() => removeService({ entryId: e._id })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
