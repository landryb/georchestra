Ext.namespace("GEOR.Addons");

GEOR.Addons.OpacitySlider = function(map, options) {
    this.map = map;
    this.options = options;
    this.control = null;
    this.item = null;
    this.toolbar = null;
};

// If required, may extend or compose with Ext.util.Observable
//Ext.extend(GEOR.Addons.Annotation, Ext.util.Observable, {
GEOR.Addons.OpacitySlider.prototype = {
    /**
     * Method: init
     *
     * Parameters:
     * record - {Ext.data.record} a record with the addon parameters
     */
    init: function(record) {

        var lang = OpenLayers.Lang.getCode(),
            item = new Ext.menu.CheckItem({
                text: record.get("title")[lang],
                qtip: record.get("description")[lang],
                //iconCls: "addon-magnifier",
                checked: false,
                listeners: {
                    "checkchange": this.onCheckchange,
                    scope: this
                }
            });
        
        var mapPanel = GeoExt.MapPanel.guess();
        
        this.toolbar = new GEOR.MapOpacitySlider({
            map: this.map,
            cls: 'opacityToolbar'
        });
        
        var container = Ext.DomHelper.append(mapPanel.bwrap, {
            tag: 'div',
            cls: 'baseLayersOpacitySlider'
        }, true /* returnElement */);
        
        this.toolbar.render(container);
        this.toolbar.doLayout();
        var totalWidth = 0;
        this.toolbar.items.each(function(item) {
            totalWidth += item.getWidth() + 5;
        });
        container.setWidth(totalWidth);
        container.setStyle({'marginLeft': (-totalWidth / 2) + 'px'});
        
        this.item = item;
        return item;
    },

    /**
     * Method: onCheckchange
     * Callback on checkbox state changed
     */
    onCheckchange: function(item, checked) {
        if (checked) {
            this.toolbar.setDisabled(false);
        } else {
            this.toolbar.setDisabled(true);
        }
    },

    /**
     * Method: destroy
     * Called by GEOR_tools when deselecting this addon
     */
    destroy: function() {
        this.toolbar.destroy();
        this.control = null;
        this.map = null;
    }
};
