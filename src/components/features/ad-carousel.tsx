import { Link } from "react-router-dom"

import { Carousel } from "@/components/arc/carousel/carousel"
import { bentoRadius, bentoSpanClass, type BentoRowSpan, type BentoSpan } from "@/components/features/bento-card"
import { cn } from "@/lib/utils"

export type AdSlide = {
  id: string
  /** The image's alternative text, which is also the name of its link. */
  title: string
  imageUrl: string
  /** A path starting with / stays in the app; anything else opens in a new tab. */
  linkUrl: string
}

/** The recommended image shape; the board crops to its slot around the center. */
export const AD_IMAGE_ASPECT = "aspect-[5/3]"

function AdSlidePanel({ slide }: { slide: AdSlide }) {
  const className = cn(bentoRadius, AD_IMAGE_ASPECT, "relative block min-h-44 w-full overflow-hidden bg-muted text-sm text-muted-foreground md:aspect-auto")
  const image = <img src={slide.imageUrl} alt={slide.title} draggable={false} className="absolute inset-0 size-full object-cover" />
  return slide.linkUrl.startsWith("/")
    ? <Link to={slide.linkUrl} className={className}>{image}</Link>
    : <a href={slide.linkUrl} target="_blank" rel="noopener noreferrer" className={className}>{image}</a>
}

export type AdCarouselProps = {
  /** Names the board for assistive technology. */
  label: string
  slides: AdSlide[]
  /** Milliseconds per slide. */
  interval?: number
  /** Omit both spans when the board is placed outside a BentoGrid. */
  span?: BentoSpan
  rowSpan?: BentoRowSpan
  className?: string
}

/** Endless rotating image board: each slide is a whole image linking somewhere, with translucent arrows over its edges and no controls row. */
export function AdCarousel({ label, slides, interval = 6000, span, rowSpan, className }: AdCarouselProps) {
  if (!slides.length) return null
  return <div className={cn(span && bentoSpanClass(span, rowSpan), "min-w-0", className)}>
    <Carousel fill loop arrowsInside hideControls label={label} slideSize="100cqw" interval={interval} autoplay slideLabel={(index, count) => `第 ${index + 1} 条，共 ${count} 条`}>
      {slides.map(slide => <AdSlidePanel key={slide.id} slide={slide} />)}
    </Carousel>
  </div>
}
