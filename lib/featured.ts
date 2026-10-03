// Places shown on the home page. Their reports are saved by `npm run snapshot`
// (data/featured.json) so the page opens instantly, then refreshed live.

export interface FeaturedSite {
  slug: string;
  name: string;
  river: string;
  country: string;
  lat: number;
  lon: number;
}

export const FEATURED: FeaturedSite[] = [
  { slug: "lokoja", name: "Lokoja", river: "Niger, below the Benue confluence", country: "Nigeria", lat: 7.8, lon: 6.74 },
  { slug: "makurdi", name: "Makurdi", river: "Benue", country: "Nigeria", lat: 7.73, lon: 8.54 },
  { slug: "onitsha", name: "Onitsha", river: "Niger", country: "Nigeria", lat: 6.15, lon: 6.78 },
  { slug: "bahadurabad", name: "Bahadurabad", river: "Jamuna (Brahmaputra)", country: "Bangladesh", lat: 25.18, lon: 89.67 },
];

export const HOME_SITE = "lokoja";
