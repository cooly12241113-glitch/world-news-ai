import {
  validGeometry,
  type LocationGeometry,
  type LocationGeometryCatalog,
  type LocationGeometryResult,
} from "./location-catalog";

const LOCATIONS: LocationGeometry[] = [
  { locationId: "world", label: "World", center: { longitude: 18, latitude: 22 }, defaultFraming: "global" },
  { locationId: "united-states", label: "United States", center: { longitude: -98, latitude: 39 }, bounds: { west: -125, south: 24, east: -66, north: 49 }, defaultFraming: "national" },
  { locationId: "east-asia", label: "East Asia", center: { longitude: 121, latitude: 34 }, bounds: { west: 103, south: 18, east: 146, north: 48 }, defaultFraming: "regional" },
  { locationId: "china", label: "China", center: { longitude: 104, latitude: 35 }, defaultFraming: "national" },
  { locationId: "south-korea", label: "South Korea", center: { longitude: 127.8, latitude: 36.3 }, bounds: { west: 126, south: 33, east: 130, north: 39 }, defaultFraming: "national" },
  { locationId: "japan", label: "Japan", center: { longitude: 138, latitude: 36 }, defaultFraming: "national" },
  { locationId: "taiwan", label: "Taiwan", center: { longitude: 121, latitude: 23.7 }, defaultFraming: "national" },
  { locationId: "middle-east", label: "Middle East", center: { longitude: 44, latitude: 29 }, defaultFraming: "regional" },
  { locationId: "red-sea", label: "Red Sea", center: { longitude: 38, latitude: 20 }, defaultFraming: "regional" },
  { locationId: "europe", label: "Europe", center: { longitude: 15, latitude: 51 }, defaultFraming: "continental" },
];

export class FixtureLocationGeometryCatalog implements LocationGeometryCatalog {
  private readonly byId = new Map(LOCATIONS.map((location) => [location.locationId, location]));
  resolve(locationId: string): LocationGeometryResult {
    const geometry = this.byId.get(locationId);
    if (!geometry || !validGeometry(geometry)) {
      return { success: false, locationId, message: `Location geometry unavailable: ${locationId}` };
    }
    return { success: true, geometry };
  }
  resolveMany(locationIds: string[]): LocationGeometryResult[] {
    return locationIds.map((id) => this.resolve(id));
  }
}
