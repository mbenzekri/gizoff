import { Component, OnInit } from '@angular/core';
import { Map, View } from 'ol';
import * as layer from 'ol/layer';
import * as source from 'ol/source';
import * as proj from 'ol/proj';
import { ScaleLine } from 'ol/control';

import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { SynchroComponent } from './synchro/synchro.component';
import { Geojson } from './lib/geojson';
@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
    mapId: string;
    map: Map = undefined;
    dlgs = {
        work: false,
        search: false,
        select: false
    };
    constructor(public matDialog: MatDialog) { }

    ngOnInit() {
        this.map = new Map({
            target: 'map',
            layers: [
                new layer.Tile({
                    source: new source.OSM(),
                }),
            ],
            view: new View({
                center: proj.fromLonLat([6.661594, 50.433237]),
                zoom: 3,
            })
        });

        const control = new ScaleLine({
            units: 'metric',
            bar: true,
            steps: 4,
            text: true,
            minWidth: 140,
        });
        this.map.addControl(control);

        const dsname = 'https://localhost:4000/geo/YVE';
        const gjlist = [ 'FDP/F_ILOT', 'FDP/F_PARCEL', 'FDP/F_BATI', 'FDP/F_SURHYD', 'FDP/F_DELIN', 'FDP/F_COMMUN', ];
        caches.open(dsname).then(cache =>
            Promise.all(gjlist.map(name => this.addGeojson(cache, dsname, name)))
                .then(gjarr => gjarr.filter(v => v))
                .then(gjarr => gjarr.forEach(geojson => this.map.addLayer(geojson.getLayer())))
        );
    }
    openWork() {
        this.dlgs.work = !this.dlgs.work;
    }
    search() {
        this.dlgs.search = !this.dlgs.search;
    }
    syncDlg() {
        const dialogConfig = new MatDialogConfig();
        // The user can't close the dialog by clicking outside its body
        dialogConfig.disableClose = false;
        dialogConfig.id = 'mi-synchro';
        dialogConfig.width = '600px';
        const modalDialog = this.matDialog.open(SynchroComponent, dialogConfig);
    }
    addGeojson(cache: Cache, dsname: string, name: string) {
        const root = `${dsname}/${name}`;
        return Promise.all([
            cache.match(`${root}.geojson`).then(r => r ? r.blob() : null),
            cache.match(`${root}.idx`).then(r => r ? r.blob() : null),
            cache.match(`${root}.sld`).then(r => r ? r.blob() : null),
            cache.match(`${root}.json`).then(r => r ? r.blob() : null)
        ]).then(ablob => {
            const blobs = { feature: ablob[0], index: ablob[1], style: ablob[2], schema: ablob[3] };
            if (blobs.feature && blobs.index) {
                const geojson = new Geojson(name, 'CRS:84', blobs);
                return geojson.load().then(_ => geojson);
            }
            return null;
        });
    }
}
