/*
 (c) 2013, Vladimir Agafonkin
 RBush, a JavaScript library for high-performance 2D spatial indexing of points and rectangles.
 https://github.com/mourner/rbush
*/
/*
    Portage de la librairie rbush avec stockage du rtree dans un ArrayBuffer
    Format du arraybuffer.

    le buffer est compos� de record de trois types : node,leaf,cluster,
    boutisme : Big Endian
    ----------------------------------------------------------------------------
    type cluster
    ----------------------------------------------------------------------------
    name       type     bytes   desc/value
    ----------------------------------------------------------------------------
    type    bytes   desc/value
    height      uint    1       constante = 0  indique le type record cluster
    xmin        float   4       xmin de l'emprise du noeud cluster
    ymin        float   4       ymin de l'emprise du noeud cluster
    xmax        float   4       xmax de l'emprise du noeud cluster
    ymax        float   4       ymax de l'emprise du noeud cluster
    recnum      uint    4       record number du feature (rang d'apparition dans le geojson)
    count       uint    4       nombre de feature successif pr�sent dans le cluster
    ----------------------------------------------------------------------------
    type leaf
    ----------------------------------------------------------------------------
    name       type     bytes   desc/value
    ----------------------------------------------------------------------------
    height      uint    1       constante = 1  indique le type record leaf
    xmin        float   4       xmin de l'emprise du noeud leaf (cluster fils compris)
    ymin        float   4       ymin de l'emprise du noeud leaf (cluster fils compris)
    xmax        float   4       xmax de l'emprise du noeud leaf (cluster fils compris)
    ymax        float   4       ymax de l'emprise du noeud leaf (cluster fils compris)
    child       uint    4       offset dans l'ArrayBuffer du premier cluster fils
    next        uint    4       offset dans l'ArrayBuffer du frere suivant dans l'arbre
    ----------------------------------------------------------------------------
    type node
    ----------------------------------------------------------------------------
    name       type     bytes   desc/value
    ----------------------------------------------------------------------------
    height      uint    1       constante > 1  indique le type record node et la hauteur du noeud dans l'arbre
    xmin        float   4       xmin de l'emprise du noeud node (node,leaf,cluster descendant compris)
    ymin        float   4       ymin de l'emprise du noeud node (node,leaf,cluster descendant compris)
    xmax        float   4       xmax de l'emprise du noeud node (node,leaf,cluster descendant compris)
    ymax        float   4       ymax de l'emprise du noeud node (node,leaf,cluster descendant compris)
    child       uint    4       offset dans l'ArrayBuffer du premier node/leaf fils
    next        uint    4       offset dans l'ArrayBuffer du frere node/leaf suivant dans l'arbre

*/

'use strict';

export class BinRtree {
    private dv: DataView;

    constructor(dataview: DataView) {
        this.dv = dataview;
    }

    height(node: number): number {
        return this.dv.getUint8(node);
    }
    child(node: number): number {
        return this.dv.getUint32(node + 17);
    }
    cluster(node: number): [number, number, number, number, number, number] {
        return [
            this.dv.getFloat32(node + 1), this.dv.getFloat32(node + 5),
            this.dv.getFloat32(node + 9), this.dv.getFloat32(node + 13),
            this.dv.getUint32(node + 17), this.dv.getUint32(node + 21)
        ];
    }
    isnode(node: number): boolean {
        return (this.height(node) > 1);
    }
    isleaf(node: number): boolean {
        return (this.height(node) === 1);
    }
    iscluster(node): boolean {
        return (this.height(node) === 0);
    }
    next(node: number): number {
        let n: number;
        if (this.iscluster(node)) {
            n = node + 25;
            n = (n < this.dv.byteLength && this.iscluster(n)) ? n : null;
        } else {
            n = this.dv.getUint32(node + 21);
            n = (n < this.dv.byteLength && n > 0) ? n : null;
        }
        return n;
    }
    clusters(node: number, result: number[][]): number[][] {
        if (this.isleaf(node)) {
            for (let acluster = this.child(node);
                acluster < this.dv.byteLength && this.iscluster(acluster);
                acluster = this.next(acluster)) {
                result.push(this.cluster(acluster));
            }
        }
        return result;
    }
    contains(a: number[], node: number): boolean {
        return a[0] <= this.dv.getFloat32(node + 1) &&
            a[1] <= this.dv.getFloat32(node + 5) &&
            this.dv.getFloat32(node + 9) <= a[2] &&
            this.dv.getFloat32(node + 13) <= a[3];
    }

    intersects(bbox: number[], node: number): boolean {
        return this.dv.getFloat32(node + 1) <= bbox[2] &&
            this.dv.getFloat32(node + 5) <= bbox[3] &&
            this.dv.getFloat32(node + 9) >= bbox[0] &&
            this.dv.getFloat32(node + 13) >= bbox[1];
    }

    private all(node: number, result: number[][]): number[][] {
        const stack = [];
        while (node !== undefined) {
            if (this.isleaf(node)) {
                this.clusters(node, result);
            } else {
                for (let c = this.child(node); c !== null; c = this.next(c)) {
                    stack.push(c);
                }
            }
            node = stack.pop();
        }
        return result;
    }

    search(bbox: number[]): number[][] {
        const result = [];
        const stack = []; // , achild: any;
        let node = 0;
        if (!this.intersects(bbox, node)) { return result; }
        if (this.isleaf(node)) { return this.clusters(node, result); }
        while (node !== undefined) {
            let achild = this.child(node);
            while (achild !== null) {
                if (this.intersects(bbox, achild)) {
                    switch (true) {
                        case (this.isleaf(achild)):
                            this.clusters(achild, result);
                            break;
                        case (this.contains(bbox, achild)):
                            this.all(achild, result);
                            break;
                        default:
                            stack.push(achild);
                    }
                }
                achild = this.next(achild);
            }
            node = stack.pop();
        }
        return result;
    }

    extent(): number[] {
        return [this.dv.getFloat32(1), this.dv.getFloat32(5), this.dv.getFloat32(9), this.dv.getFloat32(13) ];
    }
}

