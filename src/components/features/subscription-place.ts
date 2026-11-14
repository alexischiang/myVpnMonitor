/** Where a subscription pull came from, as ip2region places it. */
export type SubscriptionPlace = { geoCountry: string; province: string; city: string; isp: string }

/** 广东省 深圳市 · 电信; abroad: the country (and region) ip2region gives. */
export function placeLabel(place: SubscriptionPlace) {
  if (!place.geoCountry) return "-"
  const where = place.geoCountry === "中国"
    ? [place.province, place.city && place.city !== place.province ? place.city : ""].filter(Boolean).join(" ")
    : [place.geoCountry, place.province, place.city].filter(Boolean).join(" ")
  return [where || place.geoCountry, place.isp].filter(Boolean).join(" · ")
}
