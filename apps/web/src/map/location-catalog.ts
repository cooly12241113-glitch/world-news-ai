import type { GeoBounds, GeoPoint } from "./map-adapter";

export interface LocationGeometry {
  locationId: string;
  label: string;
  center: GeoPoint;
  bounds?: GeoBounds;
  defaultFraming: "global" | "continental" | "regional" | "national" | "subnational" | "local";
}

export type LocationGeometryResult =
  | { success: true; geometry: LocationGeometry }
  | { success: false; locationId: string; message: string };

export interface LocationGeometryCatalog {
  resolve(locationId: string): LocationGeometryResult;
  resolveMany(locationIds: string[]): LocationGeometryResult[];
}

export function validGeometry(geometry: LocationGeometry): boolean {
  const { longitude, latitude } = geometry.center;
  const values = geometry.bounds
    ? [longitude, latitude, geometry.bounds.west, geometry.bounds.south,
      geometry.bounds.east, geometry.bounds.north]
    : [longitude, latitude];
  return values.every(Number.isFinite)
    && longitude >= -180 && longitude <= 180
    && latitude >= -90 && latitude <= 90
    && (!geometry.bounds
      || (geometry.bounds.west >= -180 && geometry.bounds.east <= 180
        && geometry.bounds.south >= -90 && geometry.bounds.north <= 90
        && geometry.bounds.west <= geometry.bounds.east
        && geometry.bounds.south <= geometry.bounds.north));
}
