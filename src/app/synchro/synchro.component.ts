import { Component, OnInit, ChangeDetectorRef} from '@angular/core';
import {MatDialogRef} from '@angular/material/dialog';
import { Synchronizer, DATASETS, Dataset, SyncState } from '../lib/synchronizer';

const SKEY_CURRENTDATASET = 'mbz.sync.CURRENTDATASET';

@Component({
    selector: 'mi-synchro',
    templateUrl: './synchro.component.html',
    styleUrls: ['./synchro.component.css']
})
export class SynchroComponent implements OnInit {
    public syncers = DATASETS.map(ds => new Synchronizer(ds));
    public current: Synchronizer = null;
    public state: SyncState  = null;
    public expanded = false;
    constructor(public dialogRef: MatDialogRef<SynchroComponent>, public cd: ChangeDetectorRef) { }

    ngOnInit(): void {
        this.syncers.forEach(sc => sc.open()
            .then(so => {
                console.log(`dataset ${so.name} => syncable=${so.syncable} reachable=${so.reachable} size=${so.size()} synced=${so.synced()}`);
                this.cd.detectChanges();
            })
        );
        const dsurl = localStorage.getItem(SKEY_CURRENTDATASET);
        this.current = this.syncers.find(syncer => syncer.url === dsurl);
        this.expanded = this.registered.length === 0;
    }
    get registered() { return this.syncers.filter(s => s.registered); }
    get unregistered() { return this.syncers.filter(s => !s.registered); }

    toggle(syncer: Synchronizer) {
        if (syncer.registered && this.current !== syncer) {
            this.current = syncer;
            localStorage.setItem(SKEY_CURRENTDATASET, this.current.url);
        }
    }

    register(syncer: Synchronizer) {
        syncer.register();
        syncer.open()
            .then(so => {
                console.log(`dataset ${so.name} => syncable=${so.syncable} reachable=${so.reachable} size=${so.size()} synced=${so.synced()}`);
                this.cd.detectChanges();
        });
        if (!this.current) {
            this.toggle(syncer);
        }
        this.expanded = false;
    }

    notify(state: SyncState) {
        this.state = state;
        this.cd.detectChanges();
    }

    sync(syncer: Synchronizer) {
        syncer.sync(this.notify.bind(this))
            .then(_ => console.log(`dataset ${syncer.name} => synced size=${syncer.size()} synced=${syncer.synced()}`))
            .catch(e => console.error(`dataset ${syncer.name} sync fail`));
    }
    delete(syncer: Synchronizer) {
        syncer.delete()
            .then(_ => console.log(`dataset ${syncer.name} remove successfull`))
            .catch(e => console.error(`dataset ${syncer.name} remove fail`));
    }

    abort(syncer: Synchronizer) {
        syncer.abort();
    }

    close() {
        this.dialogRef.close();
    }
}
