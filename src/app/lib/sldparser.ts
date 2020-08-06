import { Stroke, Fill, Style, Text, Circle } from 'ol/style';
import { GFeature } from './feature';
import Geometry from 'ol/geom/Geometry';
import { METERS_PER_UNIT } from 'ol/proj/Units';
import Projection from 'ol/proj/Projection';

function hcolor2rgba(color: string, opacity: number): number[] {
    opacity = (opacity < 0) ? 0 : (opacity > 1) ? 1 : opacity;
    const r = parseInt(color.substr(1, 2), 16);
    const g = parseInt(color.substr(3, 2), 16);
    const b = parseInt(color.substr(5, 2), 16);
    return [r, g, b, opacity];
}

type GFeatureStyle = (f: GFeature, scale: number) => Style[] | Style;
type GFeatureGeom = (f: GFeature, scale: number) => Geometry;
type GFeatureText = (f: GFeature, scale: number) => string;
type PointPlacement = { type: 'point', anchor?: { x: number, y: number }, displacement?: { x: number, y: number }, rotation?: number };
type LinePlacement = {
    type: 'line',
    perpendicularoffset?: number,
    isrepeated?: boolean,
    initialgap?: number,
    gap?: number,
    isaligned?: boolean,
    generalizeline?: boolean
};
export interface Styler {
    minscale: number;
    maxscale: number;
    getStyle(): (f: GFeature, r: number) => Style | Style[];
}
export const DefaultStyler = {
    getStyle: () => () => {
        const fill = new Fill({ color: 'rgba(255,255,255,0.4)' });
        const stroke = new Stroke({ color: '#3399CC', width: 1.25 });
        const image = new Circle({ fill, stroke, radius: 5 });
        return [new Style({ image, fill, stroke })];
    },
    get minscale() {return 1; },
    get maxscale() {return 10e9; }
};

export class SldStyler implements Styler {
    public sldname: string;
    public minscale;
    public maxscale;
    public featuretypestylename: string;
    public userstylename: string;
    private style: GFeatureStyle;
    constructor(doc: Document) {
        const node = doc.querySelector('NamedLayer');
        this.NamedLayer(node);
        if (!this.minscale) {this.minscale = 1; }
        if (!this.maxscale) {this.maxscale = 10e9; }
    }
    name(node: Element) { return node.tagName.replace(/^.*:/, ''); }
    limit(scale: number) {
        if (!this.minscale || scale < this.minscale) { this.minscale = scale; }
        if (!this.maxscale || scale > this.maxscale) { this.maxscale = scale; }
    }
    getStyle(): (f: GFeature, r: number) => Style | Style[] {
        return (feature: GFeature, resolution: number) => {
            const scale = feature.source.getScale(resolution, feature.proj);
            return this.style(feature, scale);
        };
    }
    NamedLayer(node: Element) {
        Array.from(node.children).forEach(child => {
            switch (this.name(child)) {
                case 'Name':
                    this.sldname = child.innerHTML;
                    break;
                case 'UserStyle':
                    this.UserStyle(child);
                    break;
            }
        });
        return;
    }
    UserStyle(node: Element) {
        Array.from(node.children).forEach(child => {
            switch (this.name(child)) {
                case 'Name':
                    this.userstylename = child.innerHTML;
                    break;
                case 'FeatureTypeStyle':
                    this.style = this.FeatureTypeStyle(child);
                    break;
            }
        });
    }

    FeatureTypeStyle(node: Element): GFeatureStyle {
        const rules = [];
        Array.from(node.children).forEach(child => {
            switch (this.name(child)) {
                case 'Name':
                    this.featuretypestylename = child.innerHTML;
                    break;
                case 'Rule':
                    rules.push(this.Rule(child));
                    break;
            }
        });
        return (feature, scale) =>  rules.reduce((res, sf) => {
                const styles = sf(feature, scale);
                if (styles) { styles.forEach(sty =>  res.push(sty)); }
                return res;
            }, []).filter(sty => sty);
    }
    Rule(node: Element): GFeatureStyle {
        const symbolizers = [];
        let minscale = 1;
        let maxscale = 10e9;
        Array.from(node.children).forEach(child => {
            switch (this.name(child)) {
                case 'LineSymbolizer':
                    symbolizers.push(this.LineSymbolizer(child));
                    break;
                case 'PolygonSymbolizer':
                    symbolizers.push(this.PolygonSymbolizer(child));
                    break;
                case 'PointSymbolizer':
                    symbolizers.push(this.PointSymbolizer(child));
                    break;
                case 'TextSymbolizer':
                    symbolizers.push(this.TextSymbolizer(child));
                    break;
                case 'MinScaleDenominator':
                    minscale = parseInt(child.innerHTML, 10);
                    break;
                case 'MaxScaleDenominator':
                    maxscale = parseInt(child.innerHTML, 10);
                    break;
            }
        });
        [minscale, maxscale] = [Math.max(Math.min(minscale, maxscale), 1), Math.min(Math.max(minscale, maxscale), 10e9)];
        this.limit(minscale);
        this.limit(maxscale);
        return (feature, scale) => {
            if (scale > minscale && scale <= maxscale) {
                // each symbolizer func style is called , only not null are returned
                return symbolizers.map(sfunc => sfunc(feature, scale)).filter(sty => sty);
            }
            return null;
        };
    }
    LineSymbolizer(node: Element): GFeatureStyle {
        let [stroke] = [null];
        Array.from(node.children).forEach(child => {
            switch (this.name(child)) {
                case 'Stroke':
                    stroke = this.Stroke(child);
                    break;
            }
        });
        const style = new Style({ stroke });
        return (f, r: number) => style;
    }

    PolygonSymbolizer(node: Element): GFeatureStyle {
        let [stroke, fill] = [null, null];
        Array.from(node.children).forEach(child => {
            switch (this.name(child)) {
                case 'Stroke':
                    stroke = this.Stroke(child);
                    break;
                case 'Fill':
                    fill = this.Fill(child);
                    break;
            }
        });
        const style = new Style({ stroke, fill });
        return (f, r: number) => style;
    }
    PointSymbolizer(node: Element): GFeatureStyle {
        // Geometry:
        //  Graphic:
        return (f, r: number) => new Style();
    }

    // Geometry         No      The geometry to be labelled.
    // Label            No      The text content for the label.
    // Font             No      The font information for the label.
    // LabelPlacement   No      Sets the position of the label relative to its associated geometry.
    // Halo             No      Creates a colored background around the label text, for improved legibility.
    // Fill             No      The fill style of the label text.
    // Graphic          No      A graphic to be displayed behind the label text. See Graphic for content syntax.
    // Priority         No      The priority of the label during conflict resolution.
    //                          Content may contains expressions. See also Priority Labeling.
    // VendorOption     0.n    A GeoServer-specific option. See Labeling for descriptions of the available options.
    //                          Any number of options may be specified.
    TextSymbolizer(node: Element): GFeatureStyle {
        let [geom, label] = [ null, null];
        const backgroundFill = null; // TODO SEE HALO
        const backgroundStroke = null; // TODO SEE HALO
        let fill = new Fill({ color: '#000000' });
        let font: string;
        let offsetX;
        let offsetY;
        let rotation;
        const overflow = true;
        Array.from(node.children).forEach(child => {
            switch (this.name(child)) {
                case 'Geometry':
                    geom = this.Geometry(child);
                    break;
                case 'Label':
                    label = this.Label(child);
                    break;
                case 'Font':
                    font = this.Font(child);
                    break;
                case 'Fill':
                    fill = this.Fill(child);
                    break;
                case 'LabelPlacement':
                    const lp = this.LabelPlacement(child);
                    if (lp && lp.type === 'point') {
                        offsetX = lp.anchor.x;
                        offsetY = lp.anchor.y;
                        rotation = lp.rotation;
                    }
                    break;
            }
        });

        const text = new Text({
            font, fill, offsetX, offsetY, rotation, overflow
            // unused: placement, backgroundFill, backgroundStroke, maxAngle padding scale rotateWithView textBaseline textAlign
        });
        const style = new Style({ text });
        return (f, r: number) => {
            if (geom) { style.setGeometry(geom(f, r)); }
            if (label) { text.setText(label(f, r)); }
            return style;
        };
    }
    LabelPlacement(node: Element): PointPlacement | LinePlacement {
        Array.from(node.children).forEach(child => {
            switch (this.name(child)) {
                case 'PointPlacement':
                    return this.PointPlacement(child);
                case 'LinePlacement':
                    return this.LinePlacement(child);
            }
        });
        return null;
    }

    PointPlacement(node: Element): PointPlacement {
        const pointplacement: PointPlacement = {type: 'point'};
        Array.from(node.children).forEach(child => {
            switch (this.name(child)) {
                case 'AnchorPoint':
                    pointplacement.anchor = this.AnchorPoint(child);
                    break;
                case 'Displacement':
                    pointplacement.displacement = this.Displacement(child);
                    break;
                case 'Rotation':
                    pointplacement.rotation = parseFloat(child.innerHTML);
                    break;
            }
        });
        return pointplacement;
    }
    LinePlacement(node: Element): LinePlacement {
        const lp: LinePlacement = { type: 'line' };
        Array.from(node.children).forEach(child => {
            switch (this.name(child)) {
                case 'PerpendicularOffset':
                    lp.perpendicularoffset = parseFloat(child.innerHTML);
                    break;
                case 'IsRepeated':
                    lp.isrepeated = /^\s*TRUE/.test(child.innerHTML) ? true : false;
                    break;
                case 'InitialGap':
                    lp.initialgap = parseFloat(child.innerHTML);
                    break;
                case 'Gap':
                    lp.gap = parseFloat(child.innerHTML);
                    break;
                case 'Gap':
                    lp.gap = parseFloat(child.innerHTML);
                    break;
                case 'IsAligned':
                    lp.isaligned = /^\s*TRUE/.test(child.innerHTML) ? true : false;
                    break;
                case 'GeneralyseLine':
                    lp.generalizeline = /^\s*TRUE/.test(child.innerHTML) ? true : false;
                    break;
            }
        });
        return lp;
    }

    AnchorPoint(node: Element) {
        const point = { x: 0.5, y: 0.5 };
        Array.from(node.children).forEach(child => {
            switch (this.name(child)) {
                case 'AnchorPointX':
                    point.x = parseFloat(child.innerHTML);
                    break;
                case 'AnchorPointY':
                    point.y = parseFloat(child.innerHTML);
                    break;
            }
        });
        return point;
    }
    Displacement(node: Element) {
        const point = { x: 0, y: 0 };
        Array.from(node.children).forEach(child => {
            switch (this.name(child)) {
                case 'DisplacementX':
                    point.x = parseFloat(child.innerHTML);
                    break;
                case 'DisplacementY':
                    point.y = parseFloat(child.innerHTML);
                    break;
            }
        });
        return point;
    }

    Label(node: Element): GFeatureText {
        // TODO: handle text expressions
        let name = null;
        Array.from(node.children).forEach(child => {
            switch (this.name(child)) {
                case 'PropertyName':
                    name = child.innerHTML;
                    break;
            }
        });
        return (f, r: number) => name ? f.get(name) : null;
    }
    Graphic(node: Element): GFeatureStyle {
        return (f, r: number) => new Style();
    }
    Geometry(node: Element): GFeatureGeom {
        // TODO: handle geometry expressions
        let name = null;
        Array.from(node.children).forEach(child => {
            switch (this.name(child)) {
                case 'PropertyName':
                    name = child.innerHTML;
                    break;
            }
        });
        return (f, r: number) => name ? f.get(name) : null;
    }
    // <se:Font>
    // <se:SvgParameter name="font-family">MS Shell Dlg 2</se:SvgParameter>
    // <se:SvgParameter name="font-size">13</se:SvgParameter>
    // <se:SvgParameter name="font-weight">bold</se:SvgParameter>
    // </se:Font>
    Font(node: Element) {
        let size = 10;
        let weight = 'normal';
        let style = 'normal'; // TODO how to render italic ?
        const family = ['arial'];
        Array.from(node.children).forEach(child => {
            if (this.name(child) !== 'SvgParameter') { return; }
            switch (child.getAttribute('name')) {
                case 'font-family':
                    family.unshift(child.innerHTML);
                    break;
                case 'font-size':
                    size = parseInt(child.innerHTML, 10) || size;
                    break;
                case 'font-weight':
                    const fwmap = { normal: 'normal', bold: 'bold' };
                    weight = fwmap[child.innerHTML.toLowerCase()] || weight;
                    break;
                case 'font-style':
                    const fsmap = { normal: 'normal', italic: 'italic', oblique: 'oblique' };
                    style = fsmap[child.innerHTML.toLowerCase()] || style;
                    break;
            }
        });
        return `${weight} ${size}px ${family.join(',')}`;
    }
    Stroke(node: Element) {
        // SvgParameter  (name attibute)
        // stroke           No Specifies the solid color given to the line, in the form #RRGGBB. Default is black (#000000).
        // stroke-width     No Specifies the width of the line in pixels. Default is 1.
        // stroke-opacity   No Specifies the opacity (transparency) of the line.
        //                     The value is a number are between 0 (completely transparent)
        //                     and 1 (completely opaque). Default is 1.
        // stroke-linejoin  No Determines how lines are rendered at intersections of line segments.
        //                           Possible values are mitre (sharp corner), round (rounded corner), and
        //                           bevel (diagonal corner). Default is mitre.
        // stroke-linecap   No Determines how lines are rendered at their ends.
        //                     Possible values are butt (sharp square edge), round (rounded edge), and square
        //                     (slightly elongated square edge). Default is butt.
        // stroke-dasharray No Encodes a dash pattern as a series of numbers separated by spaces.
        //                     Odd-indexed numbers (first, third, etc) determine the length in pixels
        //                     to draw the line, and even-indexed numbers (second, fourth, etc) determine the length
        //                     in pixels to blank out the line. Default is an unbroken line. Starting from version 2.1
        //                     dash arrays can be combined with graphic strokes to generate complex line styles with
        //                     alternating symbols or a mix of lines and symbols.
        // stroke-dashoffset No Specifies the distance in pixels into the dasharray pattern at which to start drawing. Default is 0.
        let hcolor = '#000000';
        let opacity = 1.0;
        const opts = {
            color : hcolor2rgba(hcolor, opacity),
            width: 1,
            lineCap: ('butt' as CanvasLineCap),
            lineJoin: ('mitre' as CanvasLineJoin),
            lineDash: null,
            lineDashOffset: 0,
            miterLimit: 10
        };
        Array.from(node.children).forEach(child => {
            if (this.name(child) !== 'SvgParameter') { return; }
            switch (child.getAttribute('name')) {
                case 'stroke':
                    hcolor = child.innerHTML;
                    break;
                case 'stroke-width':
                    opts.width = parseFloat(child.innerHTML);
                    break;
                case 'stroke-opacity':
                    opacity = parseFloat(child.innerHTML);
                    break;
                case 'stroke-linejoin':
                    const ljmap = { mitre: 'mitre', round: 'round', bevel: 'bevel' };
                    opts.lineJoin = ljmap[child.innerHTML.toLowerCase()] || opts.lineJoin;
                    break;
                case 'stroke-linecap':
                    const lcmap = { butt: 'butt', round: 'round', square: 'square' };
                    opts.lineCap = lcmap[child.innerHTML.toLowerCase()] || opts.lineCap;
                    break;
                case 'stroke-dasharray':
                    opts.lineDash = child.innerHTML.split(/\s+/).map(v => parseFloat(v));
                    break;
                case 'stroke-dashoffset':
                    opts.lineDashOffset = parseFloat(child.innerHTML);
                    break;
            }
        });
        opts.color = hcolor2rgba(hcolor, opacity);
        return new Stroke(opts);
    }
    Fill(node: Element) {
        // SvgParameter  (name attibute)
        // fill             No  Specifies the fill color for the polygon, in the form #RRGGBB. Default is grey (#808080).
        // fill-opacity     No  Specifies the opacity (transparency) of the fill of the polygon.
        //                      Possible values are between 0 (completely transparent) and 1 (completely opaque). Default is 1.
        let hcolor = '#808080';
        let opacity = 1.0;
        const opts = { color : hcolor2rgba(hcolor, opacity) };
        Array.from(node.children).forEach(child => {
            if (this.name(child) !== 'SvgParameter') { return; }
            switch (child.getAttribute('name')) {
                case 'fill':
                    hcolor = child.innerHTML;
                    break;
                case 'fill-opacity':
                    opacity = parseFloat(child.innerHTML);
                    break;
            }
        });
        opts.color = hcolor2rgba(hcolor, opacity);
        return new Fill(opts);
    }
}



