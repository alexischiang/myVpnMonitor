import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"

export function StatusPage({ code, title, description, actionLabel = "返回主页", actionHref = "/login" }: { code?: string; title: string; description: string; actionLabel?: string; actionHref?: string }) {
  return <main className="grid min-h-svh place-items-center px-6 py-16"><section className="grid max-w-xl justify-items-center gap-5 text-center" aria-labelledby="status-title">{code ? <p className="text-7xl font-black tracking-tighter text-muted-foreground/30 sm:text-8xl">{code}</p> : null}<header className="grid gap-2"><h1 id="status-title" className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1><p className="text-muted-foreground">{description}</p></header><Button asChild variant="outline" size="lg"><Link to={actionHref}>{actionLabel}</Link></Button></section></main>
}
