// Curated Unsplash photo IDs for hotel/room imagery, grouped by destination.
// Each set contains 4 photos: exterior, lobby/common, room, pool/amenity.
// These are real Unsplash photo IDs — no API key required for CDN URLs.

const DESTINATION_PHOTOS: Record<string, string[]> = {
  dubai: [
    'photo-1512453979798-5ea266f8880c', // Dubai skyline / Atlantis
    'photo-1544551763-46a013bb70d5', // Luxury hotel pool Dubai
    'photo-1578683010236-d716f9a3f461', // Hotel room Dubai
    'photo-1571896349842-33c89424de2d', // Hotel lobby luxury
  ],
  london: [
    'photo-1513635269975-59663e0ac1ad', // London cityscape
    'photo-1520250497591-112f2f40a3f4', // Hotel pool London
    'photo-1631049307264-da0ec9d70304', // Luxury hotel room
    'photo-1564501049412-61c2a3083791', // Hotel lobby
  ],
  paris: [
    'photo-1502602898657-3e91760cbb34', // Paris cityscape
    'photo-1520250497591-112f2f40a3f4', // Hotel pool
    'photo-1578683010236-d716f9a3f461', // Elegant hotel room
    'photo-1571003123894-1f0594d2b5d9', // French hotel lobby
  ],
  maldives: [
    'photo-1514282401047-d79a71a590e8', // Maldives overwater bungalow
    'photo-1540202404-a2f29016b523', // Beach villa Maldives
    'photo-1563911302283-d2bc129e7570', // Water bungalow interior
    'photo-1504701954957-2010ec3bcec1', // Maldives pool villa
  ],
  bali: [
    'photo-1537996194471-e657df975ab4', // Bali rice terraces
    'photo-1555041469-a586c61ea9bc', // Bali villa pool
    'photo-1571003123894-1f0594d2b5d9', // Tropical hotel lobby
    'photo-1520250497591-112f2f40a3f4', // Infinity pool
  ],
  santorini: [
    'photo-1570077188670-e3a8d69ac5ff', // Santorini white houses
    'photo-1533104816931-20fa691ff6ca', // Santorini hotel pool
    'photo-1578683010236-d716f9a3f461', // Cave hotel room
    'photo-1504701954957-2010ec3bcec1', // Caldera view pool
  ],
  'new york': [
    'photo-1499092346589-b9b6be3e94b2', // New York skyline
    'photo-1631049307264-da0ec9d70304', // NYC hotel room
    'photo-1564501049412-61c2a3083791', // Hotel lobby NYC
    'photo-1571896349842-33c89424de2d', // Luxury hotel
  ],
  tokyo: [
    'photo-1540959733332-eab4deabeeaf', // Tokyo cityscape
    'photo-1578683010236-d716f9a3f461', // Japanese hotel room
    'photo-1564501049412-61c2a3083791', // Modern hotel lobby
    'photo-1571003123894-1f0594d2b5d9', // Hotel common area
  ],
  singapore: [
    'photo-1525625293386-3f8f99389edd', // Singapore skyline
    'photo-1504701954957-2010ec3bcec1', // Marina Bay Sands pool
    'photo-1631049307264-da0ec9d70304', // Modern hotel room
    'photo-1564501049412-61c2a3083791', // Hotel lobby Singapore
  ],
  istanbul: [
    'photo-1541432901042-2d8bd64b4a9b', // Istanbul cityscape
    'photo-1571896349842-33c89424de2d', // Luxury hotel Istanbul
    'photo-1578683010236-d716f9a3f461', // Ottoman-style room
    'photo-1520250497591-112f2f40a3f4', // Rooftop pool
  ],
  marrakech: [
    'photo-1539020140153-e479b8c22e70', // Marrakech medina
    'photo-1555041469-a586c61ea9bc', // Riad pool
    'photo-1563911302283-d2bc129e7570', // Riad interior
    'photo-1571003123894-1f0594d2b5d9', // Moroccan hotel lobby
  ],
  zanzibar: [
    'photo-1590512948681-ae1ded30b9cb', // Zanzibar beach
    'photo-1540202404-a2f29016b523', // Beach resort
    'photo-1563911302283-d2bc129e7570', // Beach villa interior
    'photo-1504701954957-2010ec3bcec1', // Ocean view pool
  ],
  seychelles: [
    'photo-1605451793880-db61d2e9ffc9', // Seychelles beach
    'photo-1514282401047-d79a71a590e8', // Overwater villa
    'photo-1540202404-a2f29016b523', // Beach bungalow
    'photo-1504701954957-2010ec3bcec1', // Resort pool
  ],
  'cape town': [
    'photo-1580060839134-75a5edca2e99', // Cape Town cityscape
    'photo-1520250497591-112f2f40a3f4', // Mountain view pool
    'photo-1631049307264-da0ec9d70304', // Modern hotel room
    'photo-1564501049412-61c2a3083791', // Hotel lobby
  ],
  'abu dhabi': [
    'photo-1512453979798-5ea266f8880c', // UAE skyline
    'photo-1544551763-46a013bb70d5', // Luxury pool
    'photo-1578683010236-d716f9a3f461', // Grand hotel room
    'photo-1571896349842-33c89424de2d', // Palace hotel lobby
  ],
  rome: [
    'photo-1529260830199-42c24126f198', // Rome cityscape
    'photo-1571003123894-1f0594d2b5d9', // Italian hotel lobby
    'photo-1578683010236-d716f9a3f461', // Classic hotel room
    'photo-1520250497591-112f2f40a3f4', // Rooftop terrace
  ],
  barcelona: [
    'photo-1558642452-9d2a7deb7f62', // Barcelona skyline
    'photo-1520250497591-112f2f40a3f4', // Hotel rooftop pool
    'photo-1631049307264-da0ec9d70304', // Modern hotel room
    'photo-1564501049412-61c2a3083791', // Hotel lobby Spain
  ],
  amsterdam: [
    'photo-1576924542622-772281b13aa3', // Amsterdam canals
    'photo-1571003123894-1f0594d2b5d9', // Dutch hotel lobby
    'photo-1578683010236-d716f9a3f461', // Hotel room Amsterdam
    'photo-1564501049412-61c2a3083791', // Boutique hotel
  ],
  // Default luxury hotel photos for any unrecognised destination
  default: [
    'photo-1571896349842-33c89424de2d', // Luxury hotel exterior
    'photo-1564501049412-61c2a3083791', // Grand hotel lobby
    'photo-1578683010236-d716f9a3f461', // Luxury hotel room
    'photo-1520250497591-112f2f40a3f4', // Infinity pool
  ],
}

export function resolveHotelImages(hotelName: string, location: string, count = 4): string[] {
  const search = `${hotelName} ${location}`.toLowerCase()

  const destinationKey = Object.keys(DESTINATION_PHOTOS).find(
    key => key !== 'default' && search.includes(key),
  ) ?? 'default'

  const photoIds = DESTINATION_PHOTOS[destinationKey]!
  const selected = photoIds.slice(0, count)

  return selected.map(id => `https://images.unsplash.com/${id}?w=800&h=560&fit=crop&q=80&auto=format`)
}
