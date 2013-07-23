Ext.namespace("GEOR");

/** api: constructor
 *  .. class:: MapOpacitySlider(config)
 */
GEOR.MapOpacitySlider = Ext.extend(Ext.Toolbar, {
    
    layers: null,
    map: null,
    leftCombo: null,
    rightCombo: null,
    mapPanel: null,
    slider: null,
    
    leftLayersStore: null,
    rightLayersStore: null,
    
    working: false,
    
    /**
     * private: method[initComponent]
     * Creates the map toolbar.
     *
     * Returns:
     * {Ext.Toolbar} The toolbar.
     */
    initComponent: function() {
        GEOR.MapOpacitySlider.superclass.initComponent.call(this);
        this.addEvents(
            /** private: event[opacitychange]
             * Throws when the opacity change.
             */
            'opacitychange',

            /** private: event[changebaselayer]
             * Throws when the opacity change.
             */
            'changebaselayer'
        );

        this.mapPanel = GeoExt.MapPanel.guess();
        this.layers = this.mapPanel.layers.queryBy(function(record) {
            return record.get('opaque');
        });
        this.initBaselayerCombo();
        this.add(this.leftCombo, this.createOpacitySlider(), this.rightCombo);
        
        this.map.events.register("changebaselayer", this, function(e) {
            this.fireEvent('changebaselayer');
        });
    },
    
    /**
     * Method: createOpacitySlider
     * Create the slider between 2 potential opaque layers 
     *
     * Returns:
     * {Ext.BoxComponent} The opacity slider
     */
    createOpacitySlider: function() {
        
        this.slider = new GeoExt.LayerOpacitySlider({
            width: 100,
            layer: this.map.getLayersBy('name', this.leftCombo.getValue())[0],
            inverse: true,
            disabled: true,
            aggressive: true,
            changeVisibility: false,
            complementaryLayer: this.map.getLayersBy('name', this.rightCombo.getValue())[0],
            maxvalue: 100,
            style: "margin-right: 10px;"
        });
        
        this.slider.on('changecomplete', function() {
            this.fireEvent('opacitychange');
        }, this);
        
        return this.slider;
    },
    
    /**
     * Method: onLayerAdd
     * If a new layer has been added to the map, then it will be added to both
     * combo box regarding certain conditions :
     *  - if a combo is empty, the layer will fill the combo, priority to the left one
     *  - if the new layer is set as a combo value, then it won't be added to the other combo
     *
     * Call back from main layerStore add event.
     */
    onLayerAdd: function(store, records, idx) {
        var rec = store.getAt(idx);
        if(rec.get('opaque') && !this.working) {
            if(this.leftLayersStore.getCount() > 0 ) {
                this.rightLayersStore.add(rec);
                
                // right combo is empty but left not, we set the new layer as right combo value
                if(this.rightLayersStore.getCount() == 1) {
                    this.rightCombo.setValue(rec.get('name'));
                    this.rightCombo.oldValue = rec.get('name');
                    this.slider.complementaryLayer = rec.getLayer();
                    this.raiseLayer(rec.getLayer());
                } else {
                    // if both combo already have values, we just add the layer in both combo list
                    this.leftLayersStore.add(rec);
                }
            }
            // The left combo is empty, we set the new layer as left combo value
            else {
                this.leftLayersStore.add(rec);
                this.leftCombo.setValue(rec.get('name'));
                this.leftCombo.oldValue = rec.get('name');
                this.slider.setLayer(rec.getLayer());
            }
            
            // If the layer has not been set to a combo value, then we hide it in the map
            if(this.leftLayersStore.getCount() > 1 && this.rightLayersStore.getCount() > 1 ) {
                rec.getLayer().setVisibility(false);
            }
            this.checkDisablement();
        }
    },
    
    /**
     * Method: onLayerRemove
     * If an opaque layer has been removed from the map, then we remove it from both combo
     * boxes.
     * 
     * Call back from main layerStore remove event.
     */
    onLayerRemove: function(store, rec, idx) {
        if(rec.get('opaque') && !this.working) {
            this.removeLayer(this.leftLayersStore,rec.get('name'), this.leftCombo);
            this.removeLayer(this.rightLayersStore,rec.get('name'), this.rightCombo);
            this.checkDisablement();
        }
    },
    
    /**
     * Method : removeLayer
     * Remove a layer from a store. If the layer was the one selected, then we update the combo
     * value with the first layer in the list.
     */
    removeLayer: function(store, name, combo) {
        var idx = store.find('name', name);
        if(idx > 0) {
            store.remove(store.getAt(idx));
            combo.setValue(store.getAt(0).get('title'));
        }
    },
    
    /**
     * Method : onComboChange
     * 
     * Called when a layer is selected in one of the combo. The layer is removed from the other combo, 
     * and the old value is added back to the other combo.
     * The select layer is set as visible while the old is truned off.
     */
    onComboChange: function(thisStore, otherStore, newRecord, oldValue) {
        otherStore.add(thisStore.getAt(thisStore.find('name', oldValue)));
        otherStore.remove(newRecord);
        
        thisStore.getAt(thisStore.find('name', oldValue)).getLayer().setVisibility(false);
        newRecord.getLayer().setVisibility(true);
    },

    /**
     * Raise a layer to the bottom of the map index.
     * The right layer is dropped down cause it has to be under the left one.
     * The raise fires add and remove record event in main layers store, that's why we turn our callback off
     * during this process to avoid triggering those events.
     */
    raiseLayer: function(layer) {
        this.working = true;
        this.map.raiseLayer(layer,-(this.map.getLayerIndex(layer)-1));
        this.working = false;
    },
    
    /**
     * Method: createBaselayerCombo
     * Create a combobox for the baselayer selection.
     *
     * Returns:
     * {Ext.form.ComboBox} The combobox.
     */
    initBaselayerCombo: function() {
        
        this.leftLayersStore = new GeoExt.data.LayerStore();
        this.rightLayersStore = new GeoExt.data.LayerStore();
        
        // load both store with all "opaque" layer of the main layerStore
        this.leftLayersStore.add(this.layers.getRange());
        this.rightLayersStore.add(this.layers.getRange());
        
        // Remove the layer that is selected in the other combo box
        this.rightLayersStore.remove(this.leftLayersStore.getAt(0));
        this.leftLayersStore.remove(this.rightLayersStore.getAt(0));

        this.leftCombo = new Ext.form.ComboBox({
            editable: false,
            hideLabel: true,
            width: 140,
            disabled: true,
            store: this.leftLayersStore,
            displayField: 'title',
            valueField: 'name',
            value: this.leftLayersStore.getCount()>0 ? this.leftLayersStore.getAt(0).get('title') : '',
            oldValue: this.leftLayersStore.getCount()>0 ? this.leftLayersStore.getAt(0).get('name') : '',
            triggerAction: 'all',
            mode: 'local',
            listeners: {
                'select': function(combo, record, index) {
                    this.slider.setLayer(record.getLayer());
                    this.onComboChange(this.leftLayersStore, this.rightLayersStore, record, combo.oldValue);
                    combo.oldValue = combo.getValue();
                },
                scope: this
            }
        });
        
        this.rightCombo = new Ext.form.ComboBox({
            editable: false,
            disabled: true,
            hideLabel: true,
            width: 140,
            store: this.rightLayersStore,
            displayField: 'title',
            valueField: 'name',
            value: this.rightLayersStore.getCount()>0 ? this.rightLayersStore.getAt(0).get('title') : '',
            oldValue: this.rightLayersStore.getCount()>0 ? this.rightLayersStore.getAt(0).get('name') : '',
            triggerAction: 'all',
            mode: 'local',
            listeners: {
                'select': function(combo, record, index) {
                    this.slider.complementaryLayer = record.getLayer();
                    this.onComboChange(this.rightLayersStore, this.leftLayersStore, record, combo.oldValue);
                    combo.oldValue = combo.getValue();
                    this.raiseLayer(record.getLayer());
                },
                scope: this
            }
        });
        
        this.on('afterrender', this.checkDisablement, this);

        this.mapPanel.layers.on('add', this.onLayerAdd, this);
        this.mapPanel.layers.on('remove', this.onLayerRemove, this);
    },
    
    /**
     * Method : checkDisablement
     * 
     * Check if the slider has to be enabled or not. At least 2 opaque layers must have been added to the
     * map to enable it.
     */
    checkDisablement : function() {
        this.setDisabled(!(this.leftLayersStore.getCount()>0 && this.rightLayersStore.getCount()>0));
    },
    
    /**
     * Method : setDisabled
     * 
     * Disable or enable all component of the tool bar.
     */
    setDisabled: function(disabled) {
        this.items.each(function(item) {
           item.setDisabled(disabled);
        });
    }
});