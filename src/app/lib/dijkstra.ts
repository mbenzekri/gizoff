// Initialize the distance to the starting node as 0 and the distances to all other nodes as infinite
// Set all nodes to “unvisited”
// While we haven’t visited all nodes:

// Find the node with currently shortest distance from the source(for the first pass, this will
// be the source node itself)
// For all nodes next to it that we haven’t visited yet, check if the currently smallest distance
// to that neighbor is bigger than if we were to go via the current node
// If it is, update the smallest distance of that neighbor to be the distance from the source
// to the current node plus the distance from the current node to that neighbor

export interface Link {
    from: number;
    to: number;
    edge: number;
    length: number;
}

export interface DijkstraOptions {
    targets?: number[];
    nodeokcb?: (node: number) => Promise<boolean>;
    edgeokcb?: (node: number) => Promise<boolean>;
    nodevisited?: (node: number) => void;
    edgevisited?: (node: number) => void;
}

/**
 * Shortest path Dijkstra algorithm
 */
export class Dijkstra {

    constructor(getadj: (node: number) => Promise<Link[]>) {
        this.getadj = getadj;
    }
    private parents: Map<number, Link> = new Map();
    private costs: Map<number, number> = new Map();
    private unvisited = new Set<number>();
    private visited = new Set<number>();
    getadj: (node: number) => Promise<Link[]>;
    targets: number[] = [];
    nodeokcb = (node: number) => Promise.resolve(true);
    edgeokcb = (edge: number) => Promise.resolve(true);
    nodevisited = (node: number) => null;
    edgevisited = (edge: number) => null;

    cost(inode: number): number {
        return this.costs.has(inode) ? this.costs.get(inode) : Number.MAX_VALUE;
    }

    pop() {
        let minnode = null;
        // search current shortest node cost
        this.unvisited.forEach((current, i) => {
            if (minnode === null || this.cost(minnode) < this.cost(current)) { minnode = current; }
        });
        // remove the node
        this.unvisited.delete(minnode);
        this.visited.add(minnode);
        return minnode;
    }

    adjacents(node: number): Promise<Link[]> {
        return this.getadj(node);
    }
    push(node: number) {
        this.unvisited.add(node);
    }

    /**
     * run the dijkstra algorithm through the provided graph with following parameters
     * @param {number} nodes recnums of start nodes (start points)
     * @param {*} targets  recnums of target nodes (destination points)
     * @param {(node:number) => boolean} nodeokcb promise return true to accept node false otherwise
     * @param {(edge:number) => boolean} edgeokcb promise return true to accept edge false otherwise
     */
    process(nodes: number[], options: DijkstraOptions) {
        // options init
        this.targets = options.targets || [];
        this.nodeokcb = options.nodeokcb || (_ => Promise.resolve(true));
        this.edgeokcb = options.edgeokcb || (_ => Promise.resolve(true));
        this.nodevisited = options.nodevisited || (_ => null);
        this.edgevisited = options.edgevisited || (_ => null);

        // initialise stuctures
        this.parents = new Map();
        this.costs = new Map();
        this.unvisited = new Set();
        this.visited = new Set();
        nodes.forEach(node => this.unvisited.add(node));
        nodes.forEach(node => this.costs.set(node, 0.0));

        // loop until all validated nodes and edges visited
        return this.loop();
    }

    loop() {
        // get min path node
        const node = this.pop();
        const cost = this.cost(node);
        // if min actual path exceed targets paths we stop processing
        if ((this.targets.length > 0) && this.targets.every(target => this.cost(target) < cost)) {
            return Promise.resolve();
        }

        // check for node validity async
        return this.nodeokcb(node).then(ok => {
            // trigger node visited callback
            this.nodevisited(node);
            if (!ok) { return []; }
            // get adjacent nodes
            return this.adjacents(node);
        }).then(children => {
            // check for edge validity
            const promises = children.map(child => this.edgeokcb(child.edge));
            return Promise.all(promises)
                .then(edgesok => children.reduce((prev, child, i) => {
                    if (edgesok[i]) { prev.push(child); }
                    return prev;
                }, []));
        }).then(children => {
            children.forEach((child, i) => {
                // trigger edge visited callback
                this.edgevisited(child.edge);
                const newCost = cost + child.length;
                const visited = (this.cost(child.to) !== Number.MAX_VALUE);
                if (this.cost(child.to) > newCost) {
                    this.costs.set(child.to, newCost);
                    this.parents.set(child.to, { from: node, to: child.to, edge: child.edge, length: child.length });
                }
                if (!this.visited.has(child.to)) { this.push(child.to); }
            });
        }).then(_ => (this.unvisited.size > 0) ? this.loop() : Promise.resolve());
    }

    shortest(target: number) {
        const path = [];
        let current = this.parents.get(target);
        while (current) {
            path.push(current);
            current = this.parents.get(current.from);
        }
        return path.reverse();
    }
    shortestnodes(target: number) {
        const path = this.shortest(target).map(e => e.from);
        path.push(target);
        return path;
    }
    shortestedges(target: number) {
        const path = this.shortest(target).map(e => e.edge);
        return path;
    }

}

/*
// shortest 0 => 3 => 6 => 7
const graph = [
    [{ from: 0, to: 1, edge: "A".charCodeAt(0), length: 1 },
    { from: 0, to: 2, edge: "B".charCodeAt(0), length: 2 },
    { from: 0, to: 3, edge: "C".charCodeAt(0), length: 5 }
    ],
    [{ from: 1, to: 4, edge: "I".charCodeAt(0), length: 4 },
    { from: 1, to: 5, edge: "H".charCodeAt(0), length: 11 }
    ],
    [{ from: 2, to: 4, edge: "G".charCodeAt(0), length: 9 },
    { from: 2, to: 5, edge: "F".charCodeAt(0), length: 5 },
    { from: 2, to: 6, edge: "E".charCodeAt(0), length: 17 }
    ],
    [{ from: 3, to: 6, edge: "D".charCodeAt(0), length: 2 }],
    [{ from: 4, to: 7, edge: "L".charCodeAt(0), length: 18 }],
    [{ from: 5, to: 7, edge: "K".charCodeAt(0), length: 13 }],
    [{ from: 6, to: 7, edge: "J".charCodeAt(0), length: 2 }]
];

// test code
const d = new Dijkstra(node => Promise.resolve(graph[node] || []))

d.process([0], { targets : [7]}).then(_ => {
    console.log('NODES=', d.shortestnodes(7))
    console.log('EDGES=', d.shortestedges(7).map(e => String.fromCharCode(e)))
    console.log('FULL=', d.shortest(7))
    // NODES= [ 0, 3, 6, 7 ]
    // EDGES= [ 'C', 'D', 'J' ]
    // FULL= [ { from: 0, to: 3, edge: 'C', length: 5 },
    //   { from: 3, to: 6, edge: 'D', length: 2 },
    //   { from: 6, to: 7, edge: 'J', length: 2 } ]

})
.then(_ => {
    d.process([0], {
        targets: [7],
        edgeokcb: (e => Promise.resolve(e !== 'C'.charCodeAt(0)))
    })
    .then(_ => {
        console.log('WITH C EDGE FORBIDDEN PATH=', d.shortestnodes(7))
        // output ==> WITH C EDGE FORBIDDEN PATH= [ 0, 2, 5, 7 ]
    })
})
.then(_ => {
    d.process([0], {
        targets: [7],
        nodeokcb: (n => Promise.resolve(n !== 6))
    })
    .then(_ => {
        console.log('WITH 6 NODE FORBIDDEN PATH=', d.shortestnodes(7))
        // output ==> WITH 6 NODE FORBIDDEN PATH= [ 0, 2, 5, 7 ]
    })
})
*/
