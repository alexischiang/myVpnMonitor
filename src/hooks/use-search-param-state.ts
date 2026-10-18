import * as React from "react"
import { useSearchParams } from "react-router-dom"

export function useSearchParamState(key: string, defaultValue: string) {
  const [searchParams, setSearchParams] = useSearchParams()
  const value = searchParams.get(key) || defaultValue
  const setValue = React.useCallback((nextValue: string) => {
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      if (!nextValue || nextValue === defaultValue) next.delete(key)
      else next.set(key, nextValue)
      return next
    }, { replace: true })
  }, [defaultValue, key, setSearchParams])
  return [value, setValue] as const
}

/** Removes several search params in one update. React Router does not queue functional updates, so resetting them one by one in the same tick keeps only the last. */
export function useClearSearchParams(keys: string[]) {
  const [, setSearchParams] = useSearchParams()
  const joined = keys.join(",")
  return React.useCallback(() => {
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      joined.split(",").forEach(key => next.delete(key))
      return next
    }, { replace: true })
  }, [joined, setSearchParams])
}
