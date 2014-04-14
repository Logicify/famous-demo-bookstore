/*globals define*/
define(function(require, exports, module) {
    'use strict';
    // Disable tap delay
    var FastClick = require('fastclick');
    FastClick.attach(document.body);
    // import dependencies
    var Engine = require('famous/core/Engine');
    var Surface = require('famous/core/Surface');
    var Modifier = require('famous/core/Modifier');
    var App = require('App');

    // create the main context
    var mainContext = Engine.createContext();
    var app = new App(mainContext);

});
