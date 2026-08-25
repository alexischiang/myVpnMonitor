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
