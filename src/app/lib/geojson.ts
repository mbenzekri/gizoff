import Feature from 'ol/Feature';
import Projection from 'ol/proj/Projection';
import * as olformat from 'ol/format';
import * as olextent from 'ol/extent';
import * as olproj from 'ol/proj';
import * as olGeom from 'ol/geom';
import * as olsphere from 'ol/sphere';
import { METERS_PER_UNIT } from 'ol/proj/Units';
import Vector from 'ol/source/Vector';
import { Fill, Stroke, Circle, Style } from 'ol/style';
import VectorImageLayer from 'ol/layer/VectorImage';
import { Dijkstra, Link } from './dijkstra';
import { Schema, FeatureType } from './featuretype';
import { BinRtree } from './binrtree';
import { SldStyler, Styler, DefaultStyler } from './sldparser';
import './string';




const CAP_SIZE = 6;
const INDEX_MD_SIZE = 68;

type Handle = {
    readonly recnum: number;
    readonly pos: number;
    readonly len: number;
};
type IndexData = { attribute: string, type: string, buffer: number, length: number, dv: DataView };

interface GeojsonFeature {
    recnum: number;
    proj: Projection;
    source: Geojson;
    ftype: FeatureType;
    distance: number;
}
type PointLike = { x?: number, y?: number } | { lon?: number, lat?: number } | number[];

function getx(pt: PointLike) {
    switch (true) {
        case Array.isArray(pt): return pt[0];
        case !!(pt as any).lon: return (pt as any).lon;
        case !!(pt as any).x: return (pt as any).x;
    }
    return null;
}

function gety(pt: PointLike) {
    switch (true) {
        case Array.isArray(pt): return pt[1];
        case !!(pt as any).lat: return (pt as any).lat;
        case !!(pt as any).y: return (pt as any).y;
    }
    return null;
}

function prefixentry(idxdata: IndexData, i: number) {
    let prefix = '';
    for (let c = 0; c < 4; c++) { prefix += String.fromCharCode(idxdata.dv.getUint8(i * 8 + c)); }
    const recnum = idxdata.dv.getUint32(i * 8 + 4);
    return { prefix, recnum };
}

type GFeature = Feature & GeojsonFeature;

type FilterOptions = {
    proj?: Projection;
    filter?: (f: GFeature, opts?: FilterOptions) => boolean;
    action?: (f: GFeature, opts?: FilterOptions) => void;
    idxfilter?: ((f: GFeature, opts?: FilterOptions) => boolean)[];
};

type PropagationOptions = {
    targets: GFeature[],
    maxfeature: number,
    proj: Projection,
    node: {
        geojson: Geojson,
        filter: (feature: GFeature) => Promise<boolean>,
    },
    edge: {
        geojson: Geojson,
        idxname: string,
        attrstart: string,
        attrend: string,
        filter: (feature: GFeature) => Promise<boolean>
    },
};

function flatten(val: any, arr: any[] = []) {
    switch (true) {
        case Array.isArray(val):
            val.forEach(item => flatten(item, arr));
            break;
        case val !== null && val !== undefined:
            arr.push(val);
            break;
    }
    return arr;
}

function applydefaults<T>(to: T, from: T): T {
    for (const key in from) {
        if (to[key] === undefined) {
            to[key] = from[key];
        }
    }
    return to;
}

export type GeojsonOptions = {
    title?: string,
    classfield?: string,
    classenum?: string[],
};
const DEFAULT_OPTIONS: GeojsonOptions = {

};
const FMT = new olformat.GeoJSON();
type GeojsonBlobs = {
    feature: Blob,
    index: Blob,
    style?: Blob,
    schema?: Blob
};

export class Geojson {
    static schema: Schema;
    static ALL = [];

    public readonly name: any;
    public readonly title: any;
    public readonly schema: Schema;
    public readonly srs: Projection;
    public readonly loaded: boolean;
    public readonly proj: Projection;
    public readonly count: number;
    private styler: Styler;
    private options: GeojsonOptions = {};
    private blobs: GeojsonBlobs;
    private rtree: BinRtree;
    private rdv: DataView;
    private indexes: { [attr: string]: IndexData };

    static remove(name) { delete Geojson.ALL[name]; }
    static get(name) { return Geojson.ALL[name]; }

    static propagation(featstart: GFeature, o: PropagationOptions) {
        const vnodes = new Set<number>();
        const vedges = new Set<number>();
        const edgegj = o.edge.geojson;
        const nodegj = o.node.geojson;
        const proj = o.proj;

        const idxdata = Object.values(edgegj.indexes).find(idx => (idx.attribute === o.edge.idxname) && (idx.type === 'network'));
        if (!idxdata) { return Promise.resolve([]); }
        const [attrbeg, attrend, attrlen] = idxdata.attribute.split('-');
        // adjacencies links  reader
        const getadjacencies = (recnode: number) => Promise.resolve(nodegj.binaryNetworkSearch(idxdata, recnode));
        // node filter
        const nodeokcb = (recnode: number): Promise<boolean> => {
            return o.node.filter
                ? nodegj.byhandle(nodegj.handle(recnode), { proj }).then(feature => feature && !o.node.filter(feature))
                : Promise.resolve(true);
        };
        // node filter
        const edgeokcb = (recedge: number): Promise<boolean> => {
            return o.edge.filter
                ? nodegj.byhandle(nodegj.handle(recedge), { proj }).then(feature => feature && !o.edge.filter(feature))
                : Promise.resolve(true);
        };
        // node/edge storage collected via nodevisited & edgevisited callback
        const nodevisited = (recnode) => vnodes.add(recnode);
        const edgevisited = (recedge) => vedges.add(recedge);
        edgevisited(featstart.recnum);
        return nodegj.flatten([
            nodegj.byref(featstart.get(attrbeg), { proj }),
            nodegj.byref(featstart.get(attrend), { proj })
        ]).then(nodes => {
            if (nodes.length > 0) {
                const starts = nodes.map(f => f.recnum);
                const targets = o.targets ? o.targets.map(f => (f as any).recnum) : undefined;
                const d = new Dijkstra(getadjacencies);
                const opts = { targets, nodevisited, edgevisited, nodeokcb, edgeokcb };
                return d.process(starts, opts).then(_ => {
                    const promises = [];
                    vedges.forEach(recnum => promises.push(edgegj.byrecnum(recnum, { proj })));
                    vnodes.forEach(recnum => promises.push(nodegj.byrecnum(recnum, { proj })));
                    return Promise.all(promises);
                });
            }
        });
    }

    constructor(name: string, srs: string, blobs: GeojsonBlobs, opts: GeojsonOptions = {}) {
        this.name = name.toUpperCase();
        this.blobs = Object.assign({}, blobs);
        this.title = opts.title ? opts.title : name;
        this.proj = olproj.get(srs);
        this.styler = DefaultStyler;
        this.rdv = null;
        this.rtree = null;
        this.indexes = null;
        this.count = 0;
        this.loaded = false;
        Geojson.ALL[this.name] = this;
    }
    get extent(): number[] {
        return this.rtree ? this.rtree.extent() : null;
    }

    load(): Promise<void> {
        this.startload();
        return Promise.all([this.loadindexes(), this.loadstyles(), this.loadschema()])
            .then(r => this.endload());
    }

    private loadindexes(): Promise<void> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = e => {
                const msg = `Geojson.loadindexes() : unable to load index ${this.name} due to: ${e.target.error}`;
                console.log(msg);
                reject(msg);
            };
            reader.onloadend = evt => {
                const buffer = evt.target.result as ArrayBuffer;
                try {
                    this.parseidxdata(buffer);
                    resolve();
                    console.log(`Geojson.loadindexes() : indexes ${this.name} loaded.`);
                } catch (e) {
                    const msg = `Geojson.loadindexes() : unable to load index ${this.name} parse error: ${e.message}`;
                    console.log(msg);
                    reject(msg);
                }
            };
            reader.readAsArrayBuffer(this.blobs.index);
        });
    }
    private loadstyles(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.blobs.style) { return resolve(); }
            const reader = new FileReader();
            reader.onerror = evt => {
                const msg = `Geojson.loadstyle() : unable to load style ${this.name}  due to: ${evt.target.error}`;
                console.log(msg);
                resolve();
            };
            reader.onloadend = evt => {
                const sldsty = evt.target.result as string;
                try {
                    // tslint:disable-next-line:no-eval
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(sldsty, 'text/xml');
                    this.styler = new SldStyler(xmlDoc);
                    console.log(`Geojson.loadstyle() : styles ${this.name} loaded.`);
                    resolve();
                }
                catch (e) {
                    const msg = `Geojson.loadstyle() : unable to load style ${this.name} eval error: ${e.message}`;
                    console.log(msg);
                    resolve();
                }
            };
            reader.readAsText(this.blobs.style);
        });
    }
    private loadschema(): Promise<Schema> {
        return new Promise((resolve) => {
            if (!this.blobs.schema) { return resolve(); }
            const reader = new FileReader();
            reader.onerror = (evt) => {
                const msg = `Geojson.loadschema() : unable to load schema ${this.name} due to ${evt.target.error}`;
                console.log(msg);
                resolve();
            };
            reader.onloadend = (e) => {
                try {
                    const data = JSON.parse((e.target.result as string));
                    const schema = new Schema(data);
                    console.log(`Geojson.loadschema() : schema ${this.name} loaded.`);
                    resolve();
                }
                catch (e) {
                    const msg = `Geojson.loadschema() : unable to load ${this.name} parse error due to ${e.message}`;
                    console.log(msg);
                    resolve();
                }
            };
            reader.readAsText(this.blobs.schema);
        });

    }

    private parseidxdata(idxbuf: ArrayBuffer) {
        this.indexes = {};
        const sdv = new DataView(idxbuf, 0, 16);
        (this as any).count = sdv.getUint32(8);
        const nbindex = sdv.getUint32(12);
        let pos = 0;
        const mdv = new DataView(idxbuf, 16, nbindex * INDEX_MD_SIZE);
        for (let i = 0; i < nbindex; i++) {
            let attribute = '';
            let type = '';
            let buffer: number;
            let length: number;
            for (let c = 0; c < 50 && mdv.getUint8(pos + c) > 0; c++) {
                attribute += String.fromCharCode(mdv.getUint8(pos + c));
            }
            pos += 50;
            for (let c = 0; c < 10 && mdv.getUint8(pos + c) > 0; c++) {
                type += String.fromCharCode(mdv.getUint8(pos + c));
            }
            pos += 10;
            buffer = mdv.getUint32(pos);
            pos += 4;
            length = mdv.getUint32(pos);
            pos += 4;
            const dv = new DataView(idxbuf, buffer, length);
            this.indexes[attribute] = { attribute, type, buffer, length, dv };
        }
        this.rdv = this.indexes._recnum_.dv;
        this.rtree = new BinRtree(this.indexes.geometry.dv);
    }

    private startload() {
        // tslint:disable-next-line:no-console
        console.time(`Geojson.load(): ${this.name} load`);
        (this as any).loaded = (this.blobs.feature && this.blobs.feature.size > 0 && this.rdv && this.rtree && this.indexes) ? true : false;
    }

    private endload() {
        // tslint:disable-next-line:no-console
        console.timeEnd(`Geojson.load(): ${this.name} load`);
        (this as any).loaded = (this.blobs.feature && this.blobs.feature.size > 0 && this.rdv && this.rtree && this.indexes) ? true : false;
    }

    private bucketbbox(bucket: number[], recnum: number): number[] {
        const tmin = this.rdv.getUint8(recnum * CAP_SIZE + 4);
        const tmax = this.rdv.getUint8(recnum * CAP_SIZE + 5);
        const wtile = Math.abs(bucket[2] - bucket[0]) / 16;
        const htile = Math.abs(bucket[3] - bucket[1]) / 16;
        // tslint:disable:no-bitwise
        const ymin = (0xF & tmin);
        const xmin = (tmin >> 4);
        const ymax = (0xF & tmax) + 1;
        const xmax = (tmax >> 4) + 1;
        // tslint:enable:no-bitwise
        return [
            bucket[0] + (xmin * wtile),
            bucket[1] + (ymin * htile),
            bucket[0] + (xmax * wtile),
            bucket[1] + (ymax * htile)
        ];
    }
    /**
     * test if two bounding boxes overlaps
     * @param bbox1 first bounding box
     * @param bbox2 second bounding box
     */
    interact(bbox1: number[], bbox2: number[]) {
        return bbox2[0] <= bbox1[2] && bbox2[1] <= bbox1[3] && bbox2[2] >= bbox1[0] && bbox2[3] >= bbox1[1];
    }

    ofproj(feature: GFeature, projection: Projection) {
        return (feature && projection && (projection === feature.proj));
    }

    private flatten(promises: Promise<GFeature[]>[]): Promise<GFeature[]> {
        return Promise.all(promises)
            .then(features => flatten(features))
            .catch(_ => Promise.resolve([]));
    }

    filter(feature: GFeature, options: FilterOptions): GFeature {
        if (options.proj && options.proj !== feature.proj) {
            feature.getGeometry().transform(feature.proj, options.proj);
            feature.proj = options.proj;
        }
        if (options.idxfilter && options.idxfilter.some(f => !f(feature))) {
            return undefined;
        }
        if (options.filter && !options.filter(feature)) {
            return undefined;
        }
        if (options.action) {
            options.action(feature, options);
        }
        return feature;
    }

    private applyfilter(opts: FilterOptions, filter: (f: GFeature, opts?: FilterOptions) => boolean) {
        const options = applydefaults({ idxfilter: [] }, opts);
        options.idxfilter.push(filter);
        return options;
    }

    private handle(recnum: number): Handle {
        const next = (recnum + 1 < this.count) ? this.rdv.getUint32((recnum + 1) * CAP_SIZE) : this.blobs.feature.size;
        const pos = this.rdv.getUint32(recnum * CAP_SIZE);
        const len = next - pos;
        return { recnum, pos, len };
    }


    foreach(options: FilterOptions = {}, i = 0): Promise<void> {
        return (i >= this.count)
            ? Promise.resolve()
            : this.byhandle(this.handle(i), options).then(_ => this.foreach(options, ++i));
    }

    byrecnum(recnum: number, options: FilterOptions = {}): Promise<GFeature> {
        return this.loaded
            ? this.byhandle(this.handle(recnum), options)
            : Promise.resolve(null);
    }

    byhandle(hdl: Handle, options: FilterOptions = {}): Promise<GFeature> {
        if (this.loaded) {
            return new Promise(resolve => {
                const reader = new FileReader();
                const slice = this.blobs.feature.slice(hdl.pos, hdl.pos + hdl.len);
                reader.onloadend = e => {
                    const json = (e.target.result as string);
                    resolve(this.byjson(hdl.recnum, json, options));
                };
                reader.onerror = _ => resolve(null);
                reader.readAsText(slice);
            });
        }
        return Promise.resolve(null);
    }

    private byjson(recnum: number, json: string, options = {}): GFeature {
        // on retrouve l'accolade fermante } => 125 ] => 93 , => 44
        const len = (() => {
            for (let i = json.length - 1; i >= 0; i--) {
                if (json.charCodeAt(i) === 125) { // cas fin de fichier
                    for (let j = i - 1; j >= 0; j--) { if (json.charCodeAt(j) === 93) { return j; } }
                    return json.length;
                }
                // cas general teminé par une virgule
                if (json.charCodeAt(i) === 44) { return i; }
            }
            return json.length;
        })();
        json = json.substring(0, len);
        let objson;
        try {
            objson = JSON.parse(json);
        } catch (e) {
            return null;
        }

        const feature = FMT.readFeature(objson, {
            dataProjection: this.proj
        }) as GFeature;
        feature.setId(this.name + '_' + recnum);
        feature.proj = this.proj;
        feature.recnum = recnum;
        feature.source = this;
        // feature.ftype = Geojson.getFeatureType(feature.get('COMPO'), feature);
        return this.filter(feature, options);
    }


    bboxsearch(bbox: number[], options: FilterOptions = {}): Promise<GFeature[]> {
        if (!this.loaded) { return Promise.resolve([]); }
        const promises = [];
        let nbbuckets = 0;
        let nbfeatures = 0;
        let found = 0;
        // walk throught rtree.
        this.rtree.search(bbox)
            .forEach(ibbox => {
                if (!this.interact(ibbox, bbox)) { return; }
                const minhandle = this.handle(ibbox[4]);
                const maxhandle = this.handle(ibbox[4] + ibbox[5] - 1);
                const promise = new Promise(resolve => {
                    const reader = new FileReader();
                    const slice = this.blobs.feature.slice(minhandle.pos, maxhandle.pos + maxhandle.len);
                    const decoder = new TextDecoder();
                    reader.onloadend = e => {
                        const geojsonlist = (e.target.result as ArrayBuffer);
                        const lowerrec = ibbox[4];
                        const upperrec = lowerrec + ibbox[5];
                        const features = [];
                        if (!geojsonlist) { return resolve(features); }
                        const offset = this.handle(lowerrec).pos;
                        for (let recnum = lowerrec; recnum < upperrec; recnum++) {
                            const cbbox = this.bucketbbox(ibbox, recnum);
                            nbfeatures += 1;
                            if (this.interact(cbbox, bbox)) {
                                const handle = this.handle(recnum);
                                const json = decoder.decode(geojsonlist.slice(handle.pos - offset, handle.pos - offset + handle.len));
                                const feature = this.byjson(recnum, json, options);
                                if (feature) {
                                    features.push(feature);
                                    found++;
                                }
                            }
                        }
                        nbbuckets += 1;
                        resolve(features);
                    };
                    reader.onerror = _ => {
                        console.log(`Geojson.bboxsearch() : ${this.name} Error while reading features`);
                        resolve();
                    };
                    reader.readAsArrayBuffer(slice);
                });
                promises.push(promise);
            });
        return this.flatten(promises)
            .finally(() => console.log(`Geojson.bboxsearch() : ${this.name} ${found}/${nbfeatures} over ${nbbuckets} buckets`));
    }


    pointsearch(point: [number, number], options: FilterOptions = {}) {
        if (!this.loaded) { return Promise.resolve([]); }
        const x = point[0];
        const y = point[1];
        const pt = new olGeom.Point([x, y]);
        const filter = feature => {
            pt.transform(this.proj, feature.proj);
            if (feature.getGeometry().containsXY) { return feature.getGeometry().containsXY(x, y); }
            if (Array.isArray(feature.getGeometry().components)) {
                return feature.getGeometry().components.some(geom => geom.containsPoint(pt));
            }
            return false;
        };
        options = this.applyfilter(options, filter);
        return this.bboxsearch([x, y, x, y], options);
    }

    nearestsearch(point: PointLike, radiusorbbox: number | number[], options: FilterOptions = {}): Promise<GFeature> {
        if (!this.loaded) { return Promise.resolve(null); }
        const x = getx(point);
        const y = gety(point);
        const ptwgs84 = olproj.transform([x, y], this.proj, olproj.get('EPSG:4326'));
        let bbox: number[];
        if (Array.isArray(radiusorbbox)) {
            bbox = radiusorbbox;
        } else {
            const radius = radiusorbbox;
            const ptdxwgs84 = olproj.transform([x + radius, y], this.proj, olproj.get('EPSG:4326'));
            const max = olsphere.getDistance(ptwgs84, ptdxwgs84);
            bbox = [x - radius, y - radius, x + radius, y + radius];
            options = this.applyfilter(options, feature => {
                const closest = feature.getGeometry().getClosestPoint([x, y]);
                const closestwgs84 = olproj.transform(closest, feature.proj, olproj.get('EPSG:4326'));
                feature.distance = olsphere.getDistance(ptwgs84, closestwgs84);
                return (feature.distance <= max);
            });
        }
        return new Promise(resolve => {
            this.bboxsearch(bbox, options)
                .then(features => {
                    const nearest = features.reduce((previous, current) => {
                        switch (true) {
                            case !current: return previous;
                            case !previous: return current;
                            case previous.distance < current.distance: return previous;
                            default: return current;
                        }
                    }, null);
                    resolve(nearest);
                }, _ => resolve());
        });
    }

    byref(ref: string, options: FilterOptions = {}): Promise<GFeature[]> {
        const [id, ftypename] = ref.split(/@/);
        const ftype = Schema.type(ftypename);
        options = this.applyfilter(options, f => f.get(this.options.classfield) === ftypename);
        return this.byattributes(ftype.idfield, [id], options);
    }

    byattributes(attr: string, values: any[], options: FilterOptions = {}): Promise<GFeature[]> {
        if (this.loaded && attr && values && values.length && attr in this.indexes && this.indexes[attr].type !== 'ordered') {
            const filter = feature => feature && values.some(v => v === feature.get(attr));
            const compare = (key, feature) => (key === feature.get(attr)) ? 0 : (key > feature.get(attr)) ? 1 : -1;
            options = this.applyfilter(options, filter);
            return this.bsearch(this.indexes[attr], values, compare, options);
        }
        return Promise.resolve([]);
    }

    fuzzysearch(attr: string, value: any, options: FilterOptions = {}, fuzzyharr: number[] = null): Promise<GFeature[]> {
        if (this.loaded && attr && value && attr in this.indexes && this.indexes[attr].type !== 'fuzzy') {
            const values = (Array.isArray(fuzzyharr)) ? fuzzyharr : [value.fuzzyHash()];
            const idxdata = this.indexes[attr];
            const compare = (key, feature) => key - feature.get(attr).fuzzyHash();
            return this.bsearch(idxdata, values, compare, options)
                .then(features => {
                    if (features && features.length > 0) {
                        features.forEach(f => f.distance = value.clean().levenshtein(f.get(attr).clean()));
                        return features.sort((f1, f2) => f1.distance - f2.distance);
                    }
                    if (!fuzzyharr) {
                        return this.fuzzysearch(attr, value, options, value.fuzzyExtend(values[0]));
                    }
                    return [];
                });
        }
    }

    private following(
        idxdata: IndexData, idxpos: number, keys: any[], cmp: (a, b) => number,
        options: FilterOptions = {}, found: GFeature[]
    ): Promise<GFeature[]> {
        if (idxpos < this.count) {
            const recnum = idxdata.dv.getUint32(idxpos * 4);
            return this.byrecnum(recnum)
                .then(feature => {
                    const res = keys.some(key => cmp(key, feature) === 0);
                    if (res) {
                        found.push(this.filter(feature, options));
                        return this.following(idxdata, idxpos + 1, keys, cmp, options, found);
                    }
                    return undefined;
                });
        }
        return Promise.resolve([]);
    }

    bsearch(
        idxdata: IndexData, keys: any[], cmp: (a, b) => number,
        options: FilterOptions, found: GFeature[] = [], imin = 0, imax = this.count - 1
    ): Promise<GFeature[]> {
        if (imax < imin) { return Promise.resolve([]); }
        // calculate midpoint to cut set in half
        const imid = Math.floor((imax + imin) / 2);
        const recnum = idxdata.dv.getUint32(imid * 4);
        return this.byrecnum(recnum)
            .then(feature => {
                const [lsubset, usubset, promises] = [[], [], []];
                if (imin === imax) {
                    promises.push(this.following(idxdata, imin, keys, cmp, options, found));
                } else {
                    keys.forEach((key, i) => (cmp(key, feature) > 0) ? lsubset.push(keys[i]) : usubset.push(keys[i]));
                }
                if (lsubset.length > 0) {
                    promises.push(this.bsearch(idxdata, lsubset, cmp, options, found, imid + 1, imax));
                }
                if (usubset.length > 0) {
                    promises.push(this.bsearch(idxdata, usubset, cmp, options, found, imin, imid));
                }
                return this.flatten(promises);
            });
    }

    prefixsearch(attr: string, prefix, maxfeature = 10, options: FilterOptions = {}) {
        if (this.loaded && this.indexes && attr in this.indexes && this.indexes[attr].type === 'prefix') {
            const idxdata = this.indexes[attr];
            const arrpref = prefix.cleanPrefix();
            const found = this.binaryPrefixSearch(idxdata, arrpref);
            let recnums: number[] = null;
            Object.values(found).forEach(set => recnums = recnums ? recnums.filter(v => set.has(v)) : Array.from(set));
            const features = [];
            const filter = (resolve, reject, i = 0) => {
                if (recnums && i < recnums.length && features.length < maxfeature) {
                    this.byrecnum(recnums[i], options).then((f: any) => {
                        if (f && arrpref.every(p => f.get(attr).cleanWords().includes(p))) { features.push(f); }
                        filter(resolve, reject, ++i);
                    });
                } else {
                    resolve(features);
                }
            };
            return new Promise(filter);
        }
    }

    binaryPrefixSearch(
        idxdata: IndexData,
        arrpref: string[],
        found: { [prefix: string]: Set<number> } = null,
        imin = 0,
        imax = idxdata.length / 8
    ): { [prefix: string]: Set<number> } {
        if (!found) { found = arrpref.reduce((p, c) => { p[c] = new Set<number>(); return p; }, {}); }
        if (imax < imin) { return found; }
        const imid = Math.floor((imax + imin) / 2);
        if (imin === imax) {
            // prefix found at imin add following recnum
            const prefix = arrpref[0];
            for (let i = imin; (i < idxdata.length / 8); i++) {
                const entry = prefixentry(idxdata, i);
                if (prefix.substring(0, 4) === entry.prefix.substring(0, Math.min(4, prefix.length))) {
                    found[prefix].add(entry.recnum);
                } else {
                    break;
                }
            }
        } else {
            const [lsubset, usubset] = [[], []];
            const entry = prefixentry(idxdata, imid);
            arrpref.forEach(p => (p.substring(0, 4) > entry.prefix) ? usubset.push(p) : lsubset.push(p));
            if (usubset.length) { this.binaryPrefixSearch(idxdata, usubset, found, imid + 1, imax); }
            if (lsubset.length) { this.binaryPrefixSearch(idxdata, lsubset, found, imin, imid); }
        }
        return found;
    }

    binaryNetworkSearch(idxdata: IndexData, node: number, imin = 0, imax = idxdata.length / 16): Link[] {
        if (imax < imin) { return []; }
        const imid = Math.floor((imax + imin) / 2);
        if (imin === imax) {
            // noe found start collecting following identical
            const found: Link[] = [];
            let finished = false;
            for (let i = imin; !finished && (i < idxdata.length / 16); i++) {
                const offset = i * 16;
                const from = idxdata.dv.getUint32(offset);
                const to = idxdata.dv.getUint32(offset + 4);
                const edge = idxdata.dv.getUint32(offset + 8);
                const length = idxdata.dv.getFloat32(offset + 12);
                finished = (node !== from);
                if (!finished) { found.push({ from, to, edge, length }); }
            }
            return found;
        }
        if (node > idxdata.dv.getUint32(imid * 16)) {
            return this.binaryNetworkSearch(idxdata, node, imid + 1, imax);
        } else {
            return this.binaryNetworkSearch(idxdata, node, imin, imid);
        }
    }

    getScale(resolution, projection) {
        const units = projection.getUnits();
        const dpi = 25.4 / 0.28;
        const mpu = METERS_PER_UNIT[units];
        const scale = resolution * mpu * 39.37 * dpi;
        return scale;
    }

    getSource(layer: VectorImageLayer): Vector {
        let lastextent = olextent.createEmpty();
        let style = null;
        let processing = false;
        const vsource = new Vector({
            useSpatialIndex: false,
            loader: (extent: olextent.Extent, resolution: number, projection: Projection) => {
                if (processing || olextent.equals(extent, lastextent)) { return; }
                processing = true;
                if (!style) {
                    style = this.styler.getStyle();
                    layer.setStyle(style);
                }
                // tslint:disable-next-line:no-console
                const start = Date.now();
                lastextent = extent;
                const scale = this.getScale(resolution, projection);
                extent = projection === this.proj ? extent : olproj.transformExtent(extent, projection, this.proj);
                if (scale < this.styler.maxscale && scale >= this.styler.minscale) {
                    this.bboxsearch(extent, { proj: projection })
                        .then(features => {
                            vsource.clear();
                            vsource.addFeatures(features);
                            // tslint:disable-next-line:no-console
                            console.log(`Geojson/loader(): ${this.name} load zoom end ${Math.floor(Date.now() - start)}ms`);
                            processing = false;
                        });
                } else {
                    vsource.clear();
                    processing = false;
                }
            },
            strategy: extent => {
                if ((vsource as any).loadedExtentsRtree_) { (vsource as any).loadedExtentsRtree_.clear(); }
                return [extent];
            }
        });
        return vsource;
    }

    getLayer(): VectorImageLayer {
        const layer = new VectorImageLayer({
            // title: geojson.name,
            // geojson,
            // group: 'group',
            imageRatio: 2,
            visible: true
        });
        layer.setSource(this.getSource(layer));
        return layer;
    }







}

