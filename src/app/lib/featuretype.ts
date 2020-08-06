import Feature from 'ol/Feature';
import { GFeature } from './feature';

const GTYPEMAP: { [key: string]: GeomType } = {
    Point: 'Point',
    LineString: 'Line',
    LinearRing: 'Line',
    Polygon: 'Polygon',
    MultiPoint: 'None',
    MultiLineString: 'Line',
    MultiPolygon: 'Polygon',
    GeometryCollection: 'None',
    Circle: 'None'
};


type GeomType = 'Point' | 'Line' | 'Polygon' | 'None';
type DataType = 'text' | 'boolean' | 'int' | 'float' | 'date' | 'doc' | 'relation';

type ValueStruct = {
    key: number | string | Date | boolean,
    value: number | string | Date | boolean
};

type FieldStruct = {
    name: string,
    title: string,
    type: DataType,
    multiple: boolean,
    required: boolean,
    unit?: string,
    scale?: number,
    precision?: number,
    length?: number,
    target?: string[],
    values?: ValueStruct[] | string
};

type FeatureTypeStruct = {
    name: string,
    title: string,
    id: string,
    type: GeomType,
    fields: FieldStruct[]
};

type SchemaTypeStruct = {
    feature_types: { [name: string]: FeatureTypeStruct }
};


/**
 * class for field description
 */
class Field {
    public readonly ftype: FeatureType;
    public readonly values?: ValueStruct[];
    public readonly name: string;
    public readonly title: string;
    public readonly type: string;
    public readonly multiple: boolean;
    public readonly required: boolean;
    public readonly scale: number;
    public readonly precision: number;
    public readonly length: number;
    public readonly unit: string;
    public readonly target: string[];

    constructor(ofield: FieldStruct, featuretype: FeatureType) {
        this.ftype = featuretype;
        this.values = (typeof ofield.values === 'string') ? null : ofield.values;
        this.name = ofield.name;
        this.title = ofield.title;
        this.type = ofield.type;
        this.multiple = ofield.multiple;
        this.required = ofield.required;
        this.unit = ofield.unit;
        this.scale = ofield.scale;
        this.precision = ofield.precision;
        this.length = ofield.length;
        this.target = ofield.target;
    }
    get enum(): boolean { return !!this.values; }
    get enumlen(): number { return this.values ? this.values.length : 0 ; }

    value(intvalue: any, fbintvalue: boolean = true) {
        switch (true) {
            case !intvalue: return null;
            case !this.enum && !fbintvalue: return null;
            case !this.enum : return intvalue;
            default:
                const found = this.values.find(vvp => vvp.key === intvalue);
                return found ? found.value : null;
        }
    }

    intvalue(value: any, fbintvalue: boolean = true) {
        switch (true) {
            case !value: return null;
            case !this.enum && !fbintvalue: return null;
            case !this.enum : return value;
            default:
                const found = this.values.find(vvp => vvp.value === value);
                return found ? found.key : null;
        }
    }
}

/**
 * feature type description class
 */
class FeatureType {

    /** internal feature type name */
    public readonly name: string;
    /** readable feature type name */
    public readonly title: string;
    /** geometry type name */
    public readonly type: GeomType;
    /** id attribute name */
    public readonly idfield: string;
    /** feature type field list */
    public readonly fields: Field[];

    constructor(ftypedata: FeatureTypeStruct, feature?: Feature) {
        this.name = ftypedata.name;
        this.title = ftypedata.title;
        this.type = ftypedata.type;
        this.idfield = ftypedata.id;
        this.fields = ftypedata.fields.map(field => new Field(field, this));
    }

    getFields(ffilter: (field: Field) => boolean = null): Field[] {
        return ffilter ? this.fields.filter(ffilter) : this.fields;
    }
    /**
     * search and return field by name
     * @param name
     */
    getField(name: string): Field {
        return this.fields.find(field => field.name === name);
    }

    value(attrname: string, intvalue: any): any {
        const field = this.getField(attrname);
        switch (true) {
            case !field: return intvalue;
            case field.type !== 'date': return field.value(intvalue);
            case intvalue instanceof Date: return intvalue;
            default: return new Date(intvalue);
        }
    }

    label(attrname) {
        const field = this.getField(attrname);
        return (field && field.title) ? field.title : attrname;
    }

    values(attrs: { [key: string]: any }, filter: (field: Field) => boolean = null)
        : { name: string, label: string, intvalue: any, value: any }[] {
        const result = [];
        Object.keys(attrs).forEach(name => {
            const intvalue = attrs[name];
            const field = this.getField(name);
            if (!filter || filter(field)) {
                const label = (field && field.title) ? field.title : name;
                const value = this.value(name, intvalue);
                if (value) { result.push({ name, label, intvalue, value }); }
            }
        });
        return result;
    }

    info(f: GFeature): string {
        return `${this.title ? this.title : this.name}: ${f.ref}`;
    }
}


/**
 * class for feature types collection and search
 */
class Schema {
    private static ftypes: { [key: string]: FeatureType } = {};
    constructor(data: SchemaTypeStruct) {
        // create Feature type object
        Object.keys(data.feature_types).forEach(name => {
            const ftypedata = data.feature_types[name];
            const ftype = new FeatureType(ftypedata);
            Schema.ftypes[name] = ftype;
        });
    }

    static type(name): FeatureType {
        return Schema.ftypes[name];
    }

    static types() {
        return Object.values(Schema.ftypes);
    }
}

export { Schema, FeatureType, Field };
