define(function(require, exports, module) {
    var Surface = require('famous/core/Surface');
    var View = require('famous/core/View');
    var _ = require('underscore');

    /**
     *
     * @extends View
     * @param options
     *
     * @constructor
     */
    function BottomToolbarItem(options) {
        View.apply(this, arguments);
        if (options) this.setOptions(options);
        this._surface = new Surface({
            origin: [0.5, 0.5],
            size: this.options.size,
            classes: this.options.classes,
            content: this._itemRenderer(this.options)
        });
        this.id=this.options.id;
        this._surface.on('click', function() {
            if (this.options.onClick) {
                this.options.onClick(this);
            }
            this._eventOutput.emit('toolbar-item-clicked', {target: this});
        }.bind(this));
        this._add(this._surface);
    }

    BottomToolbarItem.DEFAULT_OPTIONS = {
        size: [100, undefined],
        classes: ['toolbar-item'],
        iconClass: undefined,
        text: undefined,
        id: undefined,
        onClick: function(target) {}
    };

    BottomToolbarItem.prototype = Object.create(View.prototype);
    BottomToolbarItem.prototype.constructor = BottomToolbarItem;
    BottomToolbarItem.prototype.setActiveState = function(isActive) {
        var newClasslist = _.without(this._surface.getClassList(), 'active');
        if (isActive) {
            newClasslist.push('active');
        }
        this._surface.setClasses(newClasslist);
        //this._surface.commit(window.App.context);
    };

    BottomToolbarItem.prototype._itemRenderer = _.template(
        '<div id="<%= id %>"><div class="toolbar-icon <%= iconClass %>"></div><div><%= text %></div></div>'
    );

    module.exports = BottomToolbarItem;
});
