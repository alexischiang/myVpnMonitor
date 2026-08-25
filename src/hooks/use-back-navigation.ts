import * as React from "react"
import { useNavigate } from "react-router-dom"

export function useBackNavigation(fallback: string) {
  const navigate = useNavigate()
  return React.useCallback(() => {
    const index = Number(window.history.state?.idx)
    if (Number.isFinite(index) && index > 0) navigate(-1)
    else navigate(fallback)
  }, [fallback, navigate])
}
