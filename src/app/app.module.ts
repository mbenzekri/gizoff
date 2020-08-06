import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatSliderModule } from '@angular/material/slider';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatBadgeModule } from '@angular/material/badge';
import { MatMenuModule } from '@angular/material/menu';
import { MatInputModule } from '@angular/material/input';
import { MatDialogModule } from '@angular/material/dialog';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { GeosearchComponent } from './geosearch/geosearch.component';
import { SynchroComponent } from './synchro/synchro.component';

@NgModule({
    declarations: [
        AppComponent,
        GeosearchComponent,
        SynchroComponent
    ],
    imports: [
        BrowserModule,
        BrowserAnimationsModule,
        FormsModule, ReactiveFormsModule,
        MatSliderModule, MatToolbarModule, MatIconModule, MatButtonModule,
        MatBadgeModule, MatMenuModule, MatButtonToggleModule, MatInputModule,
        MatAutocompleteModule, MatDialogModule, MatSelectModule, MatRadioModule,
        MatTableModule, MatCardModule, MatCheckboxModule, MatExpansionModule,
        MatProgressBarModule
    ],
    providers: [],
    bootstrap: [AppComponent]
})
export class AppModule { }
