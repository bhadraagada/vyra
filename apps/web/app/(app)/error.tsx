"use client"

import { errorText } from "@/lib/ui"

/** Shows query errors, such as a bad trip id in the URL, instead of a blank page. */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="py-4 text-sm">
      <p>{errorText(error)}</p>
      <button className="mt-2" onClick={retry}>
        Retry
      </button>
    </div>
  )
}
