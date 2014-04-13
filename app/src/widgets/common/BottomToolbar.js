define(function(require, exports, module) {
    var Surface = require('famous/core/Surface');
    var SequentialLayout = require('famous/views/SequentialLayout');
    var ContainerSurface = require('famous/surfaces/ContainerSurface');
    var View = require('famous/core/View');
    var Modifier = require('famous/core/Modifier');
    var Transform          = require('famous/core/Transform');
    var Utility = require('famous/utilities/Utility');

    /**
     *
     * @extends View
     * @param options
     *
     * @constructor
     */
    function BottomToolbar(options) {
        View.apply(this, arguments);
        if (options) this.setOptions(options);
        var container = new ContainerSurface({
            classes: this.options.classes
        });
        var layout = new SequentialLayout({
            direction: Utility.Direction.X
        });
        this.items = [];
        var items = this.items;
        layout.sequenceFrom(items);
        // Calculating item sizes
        var autosize = [undefined, this.getSize()[1]];
        // Creating items
        for (var i = 0; i < options.items.length; i++) {
            var item = options.items[i];
            if (this.options.autosize) {
                item.size = autosize;
            }
            this._eventOutput.subscribe(item);
            items.push(item);
        }

        var modifier = new Modifier({
            transform: Transform.translate(0.5, 0),
            origin: [0.5, 0]
        });
        container.add(modifier).add(layout);
        this.add(container);
    }

    BottomToolbar.DEFAULT_OPTIONS = {
        size: [undefined, 50],
        classes: ['bottom-navigation'],
        items: [],
        autosize: true
    };

    BottomToolbar.prototype = Object.create(View.prototype);
    BottomToolbar.prototype.constructor = BottomToolbar;

    BottomToolbar.prototype.setActiveItem = function(item) {
        for (var i = 0; i < this.items.length; i++) {
            this.items[i].setActiveState(this.items[i] === item);
        }
    };

    module.exports = BottomToolbar;
});
