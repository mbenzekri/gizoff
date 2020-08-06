
const SKEY_SYNCMETADATA = 'mbz.Synchronizer.METADATA';
const SKEY_SYNCDATASETS = 'mbz.Synchronizer.DATASETS';


type lambda = (v: any) => void;

export type FileTree = {
    name: string;
    date: number;
    size: number;
    content?: FileTree[];
};

export type Dataset = {
    group: string;
    name: string;
    url: string;
};

export let DATASETS: Dataset[];

const DEFAULT_DATASETS: Dataset[] = [
    { group: 'fr', name: 'Paris, Île de France, fr', url: 'https:///localhost:8080/geo/paris' },
    { group: 'fr', name: 'Vanves, Île de France, fr', url: 'https://localhost:8080/geo/vanves' },
    { group: 'world', name: 'World', url: 'https://localhost:8080/geo/world' },
    { group: 'water', name: 'Occitanie', url: 'https://localhost:4000/geo/OCC' },
    { group: 'water', name: 'Yvelines', url: 'https://localhost:4000/geo/YVE' },
];


if (!DATASETS) {
    DATASETS = JSON.parse(localStorage.getItem(SKEY_SYNCDATASETS));
    if (!DATASETS) {
        DATASETS = DEFAULT_DATASETS;
        localStorage.setItem(SKEY_SYNCDATASETS, JSON.stringify(DATASETS));
    }
}

/**
 * Download state for a given file/url
 * @member loaded bytes loaded
 * @member total total bytes to load
 * @member begin start time
 * @member end  end time
 * @member elapsed elapsed time (ms)
 * @member left left time (ms)
 * @member rate byte rate (byte/s)
 * @member status state
 * @member xhr http request
 */
export class Loader {
    readonly url: string = null;
    private ploaded = 0;
    private ptotal = 0;
    private begin = 0;
    private end = 0;
    private pelapsed = 0;
    private pleft = 0;
    private prate = 0;
    private pstatus = 'init';
    private xhr: XMLHttpRequest = null;
    private notify: (loader: Loader) => void = null;

    constructor(url: string, notify: (loader: Loader) => void = null) {
        this.url = url;
        this.notify = notify;
    }

    get loaded() { return this.ploaded; }
    get total() { return this.ptotal; }
    get status() { return this.pstatus; }
    get left() { return this.pleft; }
    get elapsed() { return this.pelapsed; }
    get rate() { return this.prate; }
    get pcloaded() { return (100 * this.ploaded / this.ptotal); }

    /**
     * load the file
     * @returns promise resolve with the blob file or rejected on failure
     */
    load(): Promise<Blob> {
        this.begin = Date.now();
        this.end = this.begin;
        this.xhr = new XMLHttpRequest();
        return new Promise<Blob>((resolve, reject) => {
            const self = this;
            this.xhr.onprogress = (evt) => {
                if (evt.lengthComputable) {
                    this.update(evt.loaded, evt.total);
                }
            };
            this.xhr.onload = function _onl(evt) { // WARNING use of this.response (DO NOT REPLACE WITH ARROW FUNCTION)
                self.update();
                resolve(this.response);
            };
            this.xhr.onerror = (evt) => {
                this.update();
                reject((evt as any).message);
            };
            this.xhr.onabort = (evt) => {
                this.update();
                reject(`Loader ${this.url} load aborted`);
            };
            this.xhr.onreadystatechange = () => {
                this.update();
                this.updateStatus(this.xhr.statusText);
                if (this.xhr.status >= 400) {
                    this.xhr.abort();
                    reject(this.xhr.statusText);
                }
            };
            this.xhr.open('GET', this.url, true);
            this.xhr.responseType = 'blob';
            this.xhr.send(null);
        });
    }

    /**
     * update load state progress
     * @param loaded loaded byte count
     * @param total total byte to load
     */
    private update(loaded: number = null, total: number = null) {
        if (loaded && total) {
            this.ploaded = loaded;
            this.ptotal = total;
        }
        this.end = Date.now();
        this.pelapsed = this.end - this.begin;
        this.prate = (this.ploaded / (this.pelapsed / 1000));
        this.pleft = (this.ptotal - this.ploaded) * 1000 / this.prate;
        if (this.notify) { this.notify(this); }
    }

    /**
     * update load status
     * @param status update
     */
    private updateStatus(status) {
        this.pstatus = status;
        if (this.notify) { this.notify(this); }
    }


    // Permet d'abandonner le chargement
    abort() {
        if (this.xhr) { this.xhr.abort(); }
        this.xhr = null;
    }
}

/**
 * Sync state of a set of file/url
 * @member loaded bytes loaded (completed files only)
 * @member loading bytes loaded (completely and partialy loaded files)
 * @member wrote bytes wrote (files completed only)
 * @member failed bytes error (load error and wrote error)
 * @member total total byte count expected
 * @member current load file states
 * @member begin start loading date
 * @member end end loading date
 * @member elapsed sync elapsed time
 * @member left sync left time to terminate
 * @member rate  byte rate in bytes/s
 * @member status sync state
 * @member aborted true if sync aborted
 * @member processed total processed bytes (loaded/loading/failed)
 * @member pcprocessed processed bytes in percent of total  (loaded/loading/failed)
 * @member pcwritten written bytes in percent of total
 * @member pcloaded loaded bytes in percent of total (completed files)
 * @member pcloading currently loading bytes in percent of total (partially loaded files )
 * @member pcfailed failed bytes (during load or write)
 */
export class SyncState {
    private loaded = 0;
    private loading = 0;
    private wrote = 0;
    private failed = 0;
    private total = 0;
    private current: { url: string, state: Loader }[] = [];
    private tbegin = new Date();
    private tend = null;
    private elapsed = 0;
    private left = 0;
    private rate = 0;
    private status = '';
    private aborted = false;
    private resolve: lambda = null;
    private reject: lambda = null;
    readonly notify: lambda = null;
    get processed(): number { return (this.loaded + this.loading + this.failed); }
    get pcprocessed(): number { return (100 * (this.loaded + this.loading + this.failed) / this.total); }
    get pcwritten(): number { return (100 * this.wrote / this.total); }
    get pcloaded(): number { return (100 * this.loaded / this.total); }
    get pcloading(): number { return (100 * this.loading / this.total); }
    get pcfailed(): number { return (100 * this.failed / this.total); }
    get written(): number { return this.wrote; }

    private constructor(resolve: lambda, reject: lambda, notify: lambda) {
        this.resolve = resolve;
        this.reject = reject;
        this.notify = notify;
    }

    static create(total: number, written: number, resolve: lambda, reject: lambda, notify: lambda): SyncState {
        const state = new SyncState(resolve, reject, notify);
        state.total = total;
        state.tbegin = new Date();
        return state;
    }

    /**
     * update current loading state
     */
    update() {
        this.loading = 0;
        this.current.forEach(current => this.loading += current.state.loaded);
        this.tend = new Date();
        this.elapsed = this.tend.getTime() - this.tbegin.getTime();
        const loaded = this.loaded;
        this.rate = (loaded + this.loading) / (this.elapsed / 1000);
        this.left = (this.total - (loaded + this.loading)) * 1000 / this.rate;
    }

    /**
     * add new loaded bytes
     * @param bytes new loaded bytes
     */
    addloaded(bytes: number) {
        this.loaded += bytes;
        this.update();
    }

    /**
     * add new written bytes
     * @param bytes new written bytes
     */
    addwritten(bytes: number) {
        this.wrote += bytes;
        this.update();
    }

    /**
     * add new failed bytes
     * @param bytes new written bytes
     */
    addfailed(bytes) {
        this.failed += bytes;
        this.update();
    }

    /**
     * called to signal start of resource sync
     * @param url url of the resource to sync
     * @param state loading state of the resource
     */
    start(url: string, state: Loader) {
        if (state) {
            const found = this.current.find(s => s.url === url);
            if (found) {
                found.state = state;
            } else {
                this.current.push({ url, state });
            }
            this.update();
        }
    }

    /**
     * called to signal end of file sync
     * @param path path of synced file
     * @param filename name of synced file
     */
    end(url: string) {
        const found = this.current.findIndex(s => s.url === url);
        if (found >= 0) {
            this.current.splice(found, 1);
            this.update();
        }
    }

    /**
     * check for load termination and terminate processing
     */
    check() {
        if (this.aborted || (this.wrote + this.failed) >= this.total) {
            this.resolve(this);
        }
    }


    // Abandonne l'ensemble du chargement
    abort() {
        this.current.forEach(obj => obj.state.abort());
        this.aborted = true;
        this.status = 'aborted';
        if (this.resolve) { this.resolve(this); }
    }
}


export class Synchronizer {
    readonly dataset: Dataset;
    private filelist: FileTree;
    private metadata;
    private cache: Cache;
    private state: SyncState;
    get name() { return this.dataset.name; }
    get group() { return this.dataset.group; }
    get url() { return this.dataset.url; }
    get registered() { return !!this.metadata; }
    get syncable() { return !!(this.cache && this.filelist); }
    get reachable() { return !!this.filelist; }
    get syncing() { return !!this.state; }
    get pcwritten() { return this.state ? this.state.pcwritten : 0; }
    get written() { return this.state ? this.state.written : 0; }
    get total(): number { return this.state ? (this.state as any).total : 0; }
    /**
     * class Synchroniszer provide a full sync incremental sync process for a given dataset
     * @param dataset the dataset to be synchronized
     */
    constructor(dataset: Dataset) {
        this.filelist = null;
        this.dataset = dataset;
        this.metadata = JSON.parse(localStorage.getItem(`${SKEY_SYNCMETADATA}.${this.dataset.url}`));
        this.cache = null;
        this.state = null;
    }


    open(): Promise<Synchronizer> {
        return caches.has(this.url)
            .then(has => has ? caches.open(this.url) : null)
            .then(cache => this.cache = cache)
            .catch(_ => this.cache = null)
            .then(_ => fetch(this.url))
            .then(response => response.json())
            .then(data => this.filelist = data)
            .catch(_ => this.filelist = null)
            .then(_ => this);
    }
    register() {
        if (!this.metadata) {
            this.metadata = {};
            localStorage.setItem(`${SKEY_SYNCMETADATA}.${this.dataset.url}`, JSON.stringify(this.metadata));
            caches.open(this.url)
                .then(_ => console.log(`cache created for ${this.url}`))
                .catch(e => console.log(`cache creation failed for ${this.url} due to ${e}`));
        }
    }
    /**
     * test if a local resource is uptodate (time comparison in second precision)
     * @param url the resource url to check
     * @param srvtime  last update time of the resource on the server
     * @param srvsize size of the resource on the server
     */
    uptodate(url: string, srvtime: number, srvsize: number): boolean {
        if (this.metadata && this.metadata[url]) {
            // local time (seconds) and local size (bytes)
            const ltime = Math.floor(this.metadata[url].time / 1000);
            const lsize = this.metadata[url].size;
            // server time (seconds) and size (bytes)
            const stime = Math.floor(srvtime / 1000);
            const ssize = srvsize;
            return (ltime === stime && lsize === ssize);
        }
        return false;
    }

    /**
     * register new date/time for a synced resource
     * @param fullname full file
     * @param time last update time of the resource
     * @param size size of the resource
     */
    private updated(url: string, time: number, size: number) {
        this.metadata[url] = { time, size };
        localStorage.setItem(`${SKEY_SYNCMETADATA}.${this.url}`, JSON.stringify(this.metadata));
    }

    /**
     * calculate the total size of a file tree directory
     * @param flist file tree directory to calculate size
     */
    size(flist: FileTree = this.filelist): number {
        switch (true) {
            case !flist: return 0;
            case flist.size > 0: return flist.size;
            case !!flist.content: return flist.content.reduce((p, c) => p + this.size(c), 0);
            default: return 0;
        }
    }

    /**
     * calculate the total size of already synced bytes of a file tree directory
     * @param flist file tree directory to calculate synced bytes
     */
    synced(flist: FileTree = this.filelist, url = this.dataset.url) {
        switch (true) {
            case !flist: return 0;
            case (flist.size > 0 && this.uptodate(`${url}/${flist.name}`, flist.date, flist.size)):
                return flist.size;
            case !!flist.content && flist.name !== '/':
                return flist.content.reduce((p, c, i) => p + this.synced(c, `${url}/${flist.name}`), 0);
            case !!flist.content && flist.name === '/':
                return flist.content.reduce((p, c, i) => p + this.synced(c, url), 0);
            default:
                return 0;
        }
    }

    /**
     * run download/cache recursive process on file
     * @param url current root url
     * @param flist file list tree to walk for synchronisation
     */
    private dlcache(url: string = this.dataset.url, flist: FileTree = this.filelist) {
        switch (true) {
            case !this.filelist:
                return;
            case flist.size > 0:
                this.dlcachefile(`${url}/${flist.name}`, flist.date, flist.size);
                return;
            case !!flist.content && flist.name !== '/':
                flist.content.forEach(item => this.dlcache(`${url}/${flist.name}`, item));
                return;
            case !!flist.content && flist.name === '/':
                flist.content.forEach(item => this.dlcache(url, item));
                return;
        }
    }

    /**
     * download and cache a given resource (if not uptodate)
     * @param url the url resource do download and cache
     * @param time  last update time of the resource on the server
     * @param srvsize size of the resource on the server
     */
    private dlcachefile(url: string, time: number, size: number) {
        if (this.uptodate(url, time, size)) {
            this.state.addloaded(size);
            this.state.addwritten(size);
            this.state.notify(this.state);
            this.state.check();
            return;
        }
        const notify = (dlstate: Loader) => {
            this.state.notify(this.state);
        };
        const loader = new Loader(url, notify);
        this.state.start(url, loader);
        loader.load()
            .then(blob => {
                this.state.addloaded(4 * size / 5);
                this.state.notify(this.state);
                return this.cache.put(url, new Response(blob));
            })
            .then(_ => {
                this.state.end(url);
                this.updated(url, time, size);
                this.state.addwritten(size);
                this.state.notify(this.state);
                this.state.check();
            })
            .catch(e => {
                if (this.state) {
                    this.state.end(url);
                    this.state.addfailed(size);
                    this.state.notify(this.state);
                    this.state.check();
                }
            });
    }

    /**
     * synchronize the synchronizer dataset
     * @param notify notify call back for sync progress
     */
    sync(notify: (state: SyncState) => void = () => null) {
        if (this.filelist) {
            return new Promise((resolve, reject) => {
                const sresolve = v => {  this.state = null; resolve(v); };
                const sreject = v => {  this.state = null; reject(v); };
                this.state = SyncState.create(this.size(), this.synced(), sresolve, sreject, notify);
                this.dlcache();
            });
        }
        return Promise.reject('no file tree');
    }
    delete() {
        if (confirm(`Remove this dataset:\n name/group: ${this.name}/${this.group}\nurl: ${this.url}`)) {
            this.cache = null;
            this.metadata = null;
            localStorage.removeItem(`${SKEY_SYNCMETADATA}.${this.url}`);
            return caches.delete(this.url);
        }
        return Promise.resolve(false);
    }
    abort() {
        if (this.state) {
            this.state.abort();
        }
    }
}
