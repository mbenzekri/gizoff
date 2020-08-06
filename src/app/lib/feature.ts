import * as olgeom from 'ol/geom';
import * as olproj from 'ol/proj';
import * as olformat from 'ol/format';
import * as olextent from 'ol/extent';
import Feature from 'ol/Feature';
import { Geojson } from './geojson';
import { FeatureType } from './featuretype';
import { GeoJSONFeatureCollection, GeoJSONFeature } from 'ol/format/GeoJSON';
import { METERS_PER_UNIT } from 'ol/proj/Units';

export function getScale() {
    const resolution = this.getView().getResolution();
    const projection = this.getView().getProjection();
    const units = projection.getUnits();
    const dpi = 25.4 / 0.28;
    const mpu = METERS_PER_UNIT[units];
    const scale = resolution * mpu * 39.37 * dpi;
    return scale;
}

export class GFeature extends Feature {
    public readonly recnum: number;
    public readonly source: Geojson;
    public readonly ftype: FeatureType;
    public readonly proj: olproj.ProjectionLike;
    public distance: number;

    init(recnum: number, source: Geojson, ftype: FeatureType) {
        (this as any).recnum = recnum;
        (this as any).source = source;
        (this as any).ftype = ftype;
    }
    get ref() {
        return `${this.get(this.ftype.idfield)}@${this.ftype.name}`;
    }

    getReadable(exclude: string[] = []): { [key: string]: any } {
        const props = this.getProperties();
        const fields = this.ftype.getFields();
        const ordered = {};
        fields.forEach(field => { if (field.name in props) { ordered[field.name] = props[field.name]; } });
        return this.ftype.values(ordered, f => exclude.indexOf(f.name) === -1 );
    }

    geomLength(): number {
        let fulllength = 0;
        const g = this.getGeometry();
        const dstproj = olproj.get('EPSG:2154');
        const linestrings = (g instanceof olgeom.MultiLineString) ? g.getLineStrings()
            : (g instanceof olgeom.LineString) ? [g]
            : (g instanceof olgeom.Polygon) ? g.getLinearRings()
            : (g instanceof olgeom.MultiPolygon) ? g.getPolygons().reduce( (arr, p) => { arr.push(p.getLinearRings()); return arr; }, [])
            : [];
        for (const lstr of linestrings) {
            const coords = lstr.getCoordinates();
            for (let i = 0; i < coords.length - 1; ++i) {
                const pt1 = olproj.transform(coords[i], this.proj, dstproj);
                const pt2 = olproj.transform(coords[i + 1], this.proj, dstproj);
                fulllength += Math.sqrt((pt2[0] - pt1[0]) * (pt2[0] - pt1[0]) + (pt2[1] - pt1[1]) * (pt2[1] - pt1[1]));
            }
        }
        return fulllength;
    }

    maxLineString() {
        let maxlen = 0;
        let maxlstr = null;
        const g = this.getGeometry();
        const linestrings = (g instanceof olgeom.MultiLineString) ? g.getLineStrings()
            : (g instanceof olgeom.LineString) ? [g]
                : [];
        for (const lstr of linestrings) {
            const coords = lstr.getCoordinates();
            for (let i = 0; i < coords.length - 1; ++i) {
                const [pt1, pt2] = [ coords[i], coords[i + 1] ];
                const l = Math.sqrt((pt2[0] - pt1[0]) * (pt2[0] - pt1[0]) + (pt2[1] - pt1[1]) * (pt2[1] - pt1[1]));
                [maxlen, maxlstr] = (l > maxlen) ? [l, [pt1, pt2] ] : [maxlen, maxlstr];
            }
        }
        return maxlstr;
    }

}

export class GeojsonGenericFmt<T extends Feature> extends olformat.GeoJSON {
    constructor(private readonly creator: new () => T, options: any) {
        super(options);
    }
    readFeature(source: ArrayBuffer | Document | Node | object | string, options: any = {}): T {
        return super.readFeature(source, options) as T;
    }
    readFeatures(source: ArrayBuffer | Document | Node | object | string, options: any = {}): T[] {
        return super.readFeatures(source, options) as T[];
    }
    writeFeature(feature: T, options: any = {}): string {
        return super.writeFeature(feature, options);
    }
    writeFeatureObject(feature: T, options = {}): GeoJSONFeature {
        return super.writeFeatureObject(feature, options);
    }
    writeFeatures(features: T[], options: any = {}): string {
        return super.writeFeatures(features, options);
    }
    writeFeaturesObject(feature: T[], options: any = {}): GeoJSONFeatureCollection {
        return super.writeFeaturesObject(feature, options);
    }
    readFeatureFromObject(object: any, options: any): T {
        let geoJSONFeature = null;
        if (object.type === 'Feature') {
            geoJSONFeature = /** @type {GeoJSONFeature} */ (object);
        } else {
            geoJSONFeature = {
                type: 'Feature',
                geometry: /** @type {GeoJSONGeometry} */ (object),
                properties: null
            };
        }

        const geometry = this.readGeometry(geoJSONFeature.geometry, options);
        const feature = new this.creator();
        if ((this as any).geometryName_) {
            feature.setGeometryName((this as any).geometryName_);
        } else if ((this as any).extractGeometryName_ && 'geometry_name' in geoJSONFeature !== undefined) {
            feature.setGeometryName(geoJSONFeature.geometry_name);
        }
        feature.setGeometry(geometry);

        if ('id' in geoJSONFeature) {
            feature.setId(geoJSONFeature.id);
        }

        if (geoJSONFeature.properties) {
            feature.setProperties(geoJSONFeature.properties, true);
        }
        return feature;
    }


}

export function extendFeatures(extent: olextent.Extent = olextent.createEmpty(), features: GFeature[] | GFeature): olextent.Extent {
    return !extent ? olextent.createEmpty()
        : !features ? extent
            : features instanceof GFeature ? olextent.extend(extent, features.getGeometry().getExtent())
                : Array.isArray(features) ? features.reduce((p, f) => olextent.extend(extent, f.getGeometry().getExtent()), extent)
                    : extent;
}

export function extendPoint(extent: olextent.Extent, point: number[]): olextent.Extent {
    return (!extent) ? olextent.createEmpty() : olextent.extend(extent, [point[0], point[1], point[0], point[1]]);
}

export function centerExtent(extent: olextent.Extent): number[] {
    const xc = (extent[0] + extent[2]) / 2;
    const yc = (extent[1] + extent[3]) / 2;
    return [xc, yc];
}

export function scaleExtent(extent: olextent.Extent, factor: number): olextent.Extent {
    const xc = (extent[0] + extent[2]) / 2;
    const yc = (extent[1] + extent[3]) / 2;
    const w = Math.abs((extent[2] - extent[0])) / 2;
    const h = Math.abs((extent[3] - extent[1])) / 2;
    return [xc - w * factor, yc - h * factor, xc + w * factor, yc + h * factor ];
}

export function inflateExtent(extent: olextent.Extent, dx: number, dy: number): olextent.Extent {
    return [extent[0] - dx, extent[1] - dy, extent[2] + dx, extent[3] + dy];
}

export type GeojsonFormat = GeojsonGenericFmt<GFeature>;
