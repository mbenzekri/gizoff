<h2>GIZOFF: An offline gis map client<h2>

# gizoff

gizoff is an offline web map application. 

1 - This application is tied with a QGIS extension to prepare offline datasets (indexing mainly)

- datasets are produced in geojson format with qgis
- datasets are indexed with a specific indexing tool (see qgis extensions)
- dataset may be served by a static webserver (gihub may be usefull for small datasets)
- styling may be associated to a dataset dataset (prepared using styling Qgis tools SLD)
- a schema (json-schema) may be associted for presentation and editing (in the future) 

2 - The angular/material/openlayers client may

- sync in local storage a prepared datasets
- display the datasets with no network usage
- offers data discovery, search and access tools to data (when well indexed)

# The project

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 10.0.0.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory. Use the `--prod` flag for a production build.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via [Protractor](http://www.protractortest.org/).

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI README](https://github.com/angular/angular-cli/blob/master/README.md).
